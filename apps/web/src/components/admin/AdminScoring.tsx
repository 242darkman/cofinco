import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, Download, Filter, TrendingUp,
  ChevronLeft, ChevronRight, Users, Calendar,
  ArrowUpRight, ArrowDownRight, Building2,
  Award, AlertTriangle, Search,
} from 'lucide-react';
import { Card, Button, Badge, SelectField, LoadingSpinner, EmptyState, FeatureHeader, StatCard, SkeletonStatsGrid } from '../ui';
import {
  scoringAdminApi, agencesApi, clientApi,
  type AdminScoreEventsFilter, type AdminScoreStatesFilter,
  type AdminScoreEvent, type AdminScoreStateRow, type AgencyScoreStats,
} from '../../lib/api-client';
import { scoreKeys } from '../../lib/query-keys';

// ============================================================================
// CONSTANTS
// ============================================================================

const SEGMENT_STYLES: Record<string, string> = {
  VIP: 'bg-status-success-bg text-status-success border-status-success/30',
  Premium: 'bg-status-info-bg text-status-info border-status-info/30',
  Standard: 'bg-accent/10 text-accent border-accent/30',
  Risque: 'bg-status-danger-bg text-status-danger border-status-danger/30',
};

const SEGMENT_ICON: Record<string, typeof Award> = {
  VIP: Award,
  Premium: TrendingUp,
  Standard: Users,
  Risque: AlertTriangle,
};

const SEGMENT_OPTIONS = [
  { value: '', label: 'Tous segments' },
  { value: 'VIP', label: 'VIP' },
  { value: 'Premium', label: 'Premium' },
  { value: 'Standard', label: 'Standard' },
  { value: 'Risque', label: 'Risque' },
];

const EVENT_CATEGORY: Record<string, 'positive' | 'negative' | 'neutral'> = {
  EPARGNE_DEPOT: 'positive',
  CREDIT_REMBOURSEMENT: 'positive',
  CREDIT_SOLDE: 'positive',
  TONTINE_CONTRIBUTION: 'positive',
  KYC_VERIFIED: 'positive',
  PROFILE_COMPLETED: 'positive',
  BONUS_MANUEL: 'positive',
  INCIDENT_RETARD: 'negative',
  INCIDENT_DEFAUT: 'negative',
  TONTINE_PENALITE: 'negative',
  COMPTE_BLOQUE: 'negative',
  MALUS_MANUEL: 'negative',
  INITIAL_SCORE: 'neutral',
  RECALCUL_COMPLET: 'neutral',
};

const EVENT_BADGE_STYLES: Record<string, string> = {
  positive: 'bg-status-success-bg text-status-success',
  negative: 'bg-status-danger-bg text-status-danger',
  neutral: 'bg-surface-subtle text-content-muted',
};

const PAGE_SIZE = 25;

type Tab = 'events' | 'states' | 'stats';

function scoreColor(val: number): string {
  if (val >= 80) return 'text-status-success';
  if (val >= 65) return 'text-status-info';
  if (val >= 40) return 'text-status-warning';
  return 'text-status-danger';
}

function scoreBarColor(val: number): string {
  if (val >= 80) return 'bg-status-success';
  if (val >= 65) return 'bg-status-info';
  if (val >= 40) return 'bg-status-warning';
  return 'bg-status-danger';
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminScoring() {
  const [activeTab, setActiveTab] = useState<Tab>('states');

  return (
    <div className="space-y-4 sm:space-y-6">
      <FeatureHeader
        featureKey="admin.scoring"
        title="Scoring Clients"
        subtitle="Vue d'ensemble des scores, journal d'événements et statistiques par agence"
        icon={<div className="p-2 bg-accent/10 rounded-xl"><BarChart3 className="text-accent" size={22} /></div>}
      />

      {/* Tab bar */}
      <div className="flex gap-1 bg-surface-subtle rounded-lg p-1">
        {([
          { id: 'states' as const, label: 'Scores', icon: TrendingUp },
          { id: 'events' as const, label: 'Journal', icon: Filter },
          { id: 'stats' as const, label: 'Agences', icon: Building2 },
        ]).map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                isActive
                  ? 'bg-surface text-content-primary shadow-sm'
                  : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'states' && <StatesTab />}
      {activeTab === 'events' && <EventsTab />}
      {activeTab === 'stats' && <StatsTab />}
    </div>
  );
}

// ============================================================================
// EVENTS TAB (Audit Log)
// ============================================================================

function EventsTab() {
  const [filters, setFilters] = useState<AdminScoreEventsFilter>({ limit: PAGE_SIZE, offset: 0 });
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [agenceFilter, setAgenceFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const activeFilters = useMemo(() => ({
    ...filters,
    eventType: eventTypeFilter || undefined,
    agenceId: agenceFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }), [filters, eventTypeFilter, agenceFilter, dateFrom, dateTo]);

  const { data, isLoading } = useQuery({
    queryKey: scoreKeys.adminEvents(activeFilters),
    queryFn: () => scoringAdminApi.getEvents(activeFilters),
  });

  const { data: eventTypes } = useQuery({
    queryKey: scoreKeys.adminEventTypes(),
    queryFn: () => scoringAdminApi.getEventTypes(),
    staleTime: 60 * 60 * 1000,
  });

  const { data: agences } = useQuery({
    queryKey: ['agences'],
    queryFn: () => agencesApi.getAgences(),
    staleTime: 5 * 60 * 1000,
  });

  const eventTypeOptions = useMemo(() => {
    const opts = [{ value: '', label: 'Tous types' }];
    if (eventTypes) {
      Object.entries(eventTypes).forEach(([key, label]) => {
        opts.push({ value: key, label });
      });
    }
    return opts;
  }, [eventTypes]);

  const agenceOptions = useMemo(() => {
    const opts = [{ value: '', label: 'Toutes agences' }];
    if (agences) {
      agences.forEach(a => opts.push({ value: a.id, label: a.nom }));
    }
    return opts;
  }, [agences]);

  const page = Math.floor((filters.offset || 0) / PAGE_SIZE);
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  function goToPage(p: number) {
    setFilters(prev => ({ ...prev, offset: p * PAGE_SIZE }));
  }

  function handleExportCsv() {
    window.open(scoringAdminApi.exportEventsUrl(activeFilters), '_blank');
  }

  const hasActiveFilters = !!(eventTypeFilter || agenceFilter || dateFrom || dateTo);

  return (
    <>
      {/* Filters */}
      <Card className="bg-surface/80 border-edge p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-3">
          <Search size={14} className="text-content-muted" />
          <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider">Filtres</h3>
          {hasActiveFilters && (
            <button
              onClick={() => { setEventTypeFilter(''); setAgenceFilter(''); setDateFrom(''); setDateTo(''); setFilters(f => ({ ...f, offset: 0 })); }}
              className="ml-auto text-[10px] text-accent hover:underline"
            >
              Réinitialiser
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-[10px] font-medium text-content-muted mb-1 uppercase tracking-wide">Type</label>
            <SelectField
              options={eventTypeOptions}
              value={eventTypeFilter}
              onChange={(e) => { setEventTypeFilter(e.target.value); setFilters(f => ({ ...f, offset: 0 })); }}
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-content-muted mb-1 uppercase tracking-wide">Agence</label>
            <SelectField
              options={agenceOptions}
              value={agenceFilter}
              onChange={(e) => { setAgenceFilter(e.target.value); setFilters(f => ({ ...f, offset: 0 })); }}
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-content-muted mb-1 uppercase tracking-wide">Du</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setFilters(f => ({ ...f, offset: 0 })); }}
              className="w-full px-2.5 py-1.5 text-xs rounded-md border border-input-border bg-input text-content-primary focus:border-input-focus focus:outline-none"
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-[10px] font-medium text-content-muted mb-1 uppercase tracking-wide">Au</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setFilters(f => ({ ...f, offset: 0 })); }}
                className="w-full px-2.5 py-1.5 text-xs rounded-md border border-input-border bg-input text-content-primary focus:border-input-focus focus:outline-none"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={handleExportCsv} title="Exporter CSV" className="shrink-0">
              <Download size={14} />
            </Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      {isLoading ? (
        <SkeletonStatsGrid />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          icon={Filter}
          title="Aucun événement scoring"
          description="Aucun événement ne correspond aux filtres sélectionnés."
        />
      ) : (
        <Card className="overflow-hidden border-edge">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-subtle border-b border-edge">
                  <th className="text-left px-3 py-2.5 font-semibold text-content-muted text-[10px] uppercase tracking-wider">Date</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-content-muted text-[10px] uppercase tracking-wider">Client</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-content-muted text-[10px] uppercase tracking-wider">Type</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-content-muted text-[10px] uppercase tracking-wider">Points</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-content-muted text-[10px] uppercase tracking-wider">Montant</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-content-muted text-[10px] uppercase tracking-wider hidden md:table-cell">Motif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge-subtle">
                {data.rows.map((evt) => (
                  <EventRow key={evt.id} event={evt} eventTypes={eventTypes} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-surface-subtle border-t border-edge">
            <span className="text-xs text-content-muted">{data.total} événement{data.total > 1 ? 's' : ''}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page === 0}
                className="p-1.5 rounded-md hover:bg-surface-elevated disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-content-secondary px-2 font-medium">{page + 1} / {totalPages || 1}</span>
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-md hover:bg-surface-elevated disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

function EventRow({ event, eventTypes }: { event: AdminScoreEvent; eventTypes?: Record<string, string> }) {
  const label = eventTypes?.[event.eventType] || event.eventType;
  const delta = event.pointsDelta ?? 0;
  const isPositive = delta > 0;
  const isNegative = delta < 0;
  const category = EVENT_CATEGORY[event.eventType] || 'neutral';
  const badgeStyle = EVENT_BADGE_STYLES[category];

  return (
    <tr className="hover:bg-surface-subtle/50 transition-colors">
      <td className="px-3 py-2.5 text-content-secondary whitespace-nowrap text-[11px]">
        {event.createdAt ? new Date(event.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
      </td>
      <td className="px-3 py-2.5 text-content-primary font-medium">
        {[event.clientPrenom, event.clientNom].filter(Boolean).join(' ') || event.clientId?.slice(0, 8)}
      </td>
      <td className="px-3 py-2.5">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${badgeStyle}`}>
          {category === 'positive' && <ArrowUpRight size={10} />}
          {category === 'negative' && <ArrowDownRight size={10} />}
          {label}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right">
        <span className={`inline-flex items-center gap-0.5 font-mono font-bold text-xs ${isPositive ? 'text-status-success' : isNegative ? 'text-status-danger' : 'text-content-muted'}`}>
          {isPositive ? '+' : ''}{delta}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-content-secondary">
        {event.montant ? Number(event.montant).toLocaleString('fr-FR') : '-'}
      </td>
      <td className="px-3 py-2.5 text-content-muted hidden md:table-cell max-w-[200px] truncate">
        {event.reason || '-'}
      </td>
    </tr>
  );
}

// ============================================================================
// STATES TAB (Score Overview)
// ============================================================================

function StatesTab() {
  const [filters, setFilters] = useState<AdminScoreStatesFilter>({ limit: PAGE_SIZE, offset: 0 });
  const [segmentFilter, setSegmentFilter] = useState('');
  const [agenceFilter, setAgenceFilter] = useState('');

  const activeFilters = useMemo(() => ({
    ...filters,
    segment: segmentFilter || undefined,
    agenceId: agenceFilter || undefined,
  }), [filters, segmentFilter, agenceFilter]);

  const { data, isLoading } = useQuery({
    queryKey: scoreKeys.adminStates(activeFilters),
    queryFn: () => scoringAdminApi.getStates(activeFilters),
  });

  const { data: agences } = useQuery({
    queryKey: ['agences'],
    queryFn: () => agencesApi.getAgences(),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch agency stats for the summary cards
  const { data: agencyStats } = useQuery({
    queryKey: scoreKeys.agencyStats(),
    queryFn: () => clientApi.getAgencyScoreStats(),
    staleTime: 2 * 60 * 1000,
  });

  // Compute global summary from agency stats
  const summary = useMemo(() => {
    if (!agencyStats || agencyStats.length === 0) return null;
    let totalClients = 0;
    let scoreSum = 0;
    const segments = { VIP: 0, Premium: 0, Standard: 0, Risque: 0 };
    for (const s of agencyStats) {
      totalClients += s.totalClients;
      scoreSum += s.avgScore * s.totalClients;
      segments.VIP += s.segments.VIP;
      segments.Premium += s.segments.Premium;
      segments.Standard += s.segments.Standard;
      segments.Risque += s.segments.Risque;
    }
    const avgScore = totalClients > 0 ? Math.round(scoreSum / totalClients) : 0;
    return { totalClients, avgScore, segments };
  }, [agencyStats]);

  const agenceOptions = useMemo(() => {
    const opts = [{ value: '', label: 'Toutes agences' }];
    if (agences) agences.forEach(a => opts.push({ value: a.id, label: a.nom }));
    return opts;
  }, [agences]);

  const page = Math.floor((filters.offset || 0) / PAGE_SIZE);
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  function goToPage(p: number) {
    setFilters(prev => ({ ...prev, offset: p * PAGE_SIZE }));
  }

  function handleExportCsv() {
    window.open(scoringAdminApi.exportStatesUrl(activeFilters), '_blank');
  }

  function selectSegment(seg: string) {
    setSegmentFilter(prev => prev === seg ? '' : seg);
    setFilters(f => ({ ...f, offset: 0 }));
  }

  return (
    <>
      {/* Segment summary cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
          <StatCard
            title="Total clients"
            value={summary.totalClients}
            icon={Users}
            color="primary"
          />
          {(['VIP', 'Premium', 'Standard', 'Risque'] as const).map(seg => {
            const count = summary.segments[seg];
            const Icon = SEGMENT_ICON[seg];
            const isSelected = segmentFilter === seg;
            const colorMap: Record<string, 'success' | 'primary' | 'neutral' | 'danger'> = {
              VIP: 'success', Premium: 'primary', Standard: 'neutral', Risque: 'danger',
            };
            return (
              <StatCard
                key={seg}
                title={seg}
                value={count}
                icon={Icon}
                color={colorMap[seg]}
                onClick={() => selectSegment(seg)}
                className={`cursor-pointer transition-all ${isSelected ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : 'hover:scale-[1.02]'}`}
                subtitle={summary.totalClients > 0
                  ? <span className="text-[10px] text-content-muted">{Math.round((count / summary.totalClients) * 100)}%</span>
                  : undefined
                }
              />
            );
          })}
        </div>
      )}

      {/* Filters row */}
      <Card className="bg-surface/80 border-edge p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[10px] font-medium text-content-muted mb-1 uppercase tracking-wide">Segment</label>
            <SelectField
              options={SEGMENT_OPTIONS}
              value={segmentFilter}
              onChange={(e) => { setSegmentFilter(e.target.value); setFilters(f => ({ ...f, offset: 0 })); }}
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[10px] font-medium text-content-muted mb-1 uppercase tracking-wide">Agence</label>
            <SelectField
              options={agenceOptions}
              value={agenceFilter}
              onChange={(e) => { setAgenceFilter(e.target.value); setFilters(f => ({ ...f, offset: 0 })); }}
            />
          </div>
          <Button variant="ghost" size="sm" onClick={handleExportCsv} title="Exporter CSV" className="shrink-0">
            <Download size={14} />
            CSV
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Aucun score calculé"
          description="Aucun client n'a encore de score dans les filtres sélectionnés."
        />
      ) : (
        <Card className="overflow-hidden border-edge">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-subtle border-b border-edge">
                  <th className="text-left px-3 py-2.5 font-semibold text-content-muted text-[10px] uppercase tracking-wider">Client</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-content-muted text-[10px] uppercase tracking-wider w-[180px]">Score global</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-content-muted text-[10px] uppercase tracking-wider">Segment</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-content-muted text-[10px] uppercase tracking-wider hidden sm:table-cell">Paiement</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-content-muted text-[10px] uppercase tracking-wider hidden sm:table-cell">Fidélité</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-content-muted text-[10px] uppercase tracking-wider hidden md:table-cell">Engagement</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-content-muted text-[10px] uppercase tracking-wider hidden md:table-cell">Conformité</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-content-muted text-[10px] uppercase tracking-wider hidden lg:table-cell">Taux R.</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-content-muted text-[10px] uppercase tracking-wider hidden lg:table-cell">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge-subtle">
                {data.rows.map((row) => (
                  <StateRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-3 py-2.5 bg-surface-subtle border-t border-edge">
            <span className="text-xs text-content-muted">{data.total} client{data.total > 1 ? 's' : ''}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => goToPage(page - 1)} disabled={page === 0} className="p-1.5 rounded-md hover:bg-surface-elevated disabled:opacity-30 transition-colors">
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-content-secondary px-2 font-medium">{page + 1} / {totalPages || 1}</span>
              <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages - 1} className="p-1.5 rounded-md hover:bg-surface-elevated disabled:opacity-30 transition-colors">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

function StateRow({ row }: { row: AdminScoreStateRow }) {
  const segmentCls = SEGMENT_STYLES[row.segment] || SEGMENT_STYLES.Standard;

  return (
    <tr className="hover:bg-surface-subtle/50 transition-colors">
      <td className="px-3 py-2.5 text-content-primary font-medium">
        {[row.clientPrenom, row.clientNom].filter(Boolean).join(' ') || row.clientId?.slice(0, 8)}
      </td>
      {/* Score global with progress bar */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`font-bold font-mono text-sm min-w-[28px] ${scoreColor(row.scoreGlobal)}`}>{row.scoreGlobal}</span>
          <div className="flex-1 h-1.5 rounded-full bg-surface-subtle overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${scoreBarColor(row.scoreGlobal)}`}
              style={{ width: `${Math.min(row.scoreGlobal, 100)}%` }}
            />
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-center">
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${segmentCls}`}>
          {row.segment}
        </span>
      </td>
      {/* Component scores with mini indicators */}
      <td className="px-3 py-2.5 text-center hidden sm:table-cell">
        <ComponentScoreCell value={row.scorePayment} />
      </td>
      <td className="px-3 py-2.5 text-center hidden sm:table-cell">
        <ComponentScoreCell value={row.scoreLoyalty} />
      </td>
      <td className="px-3 py-2.5 text-center hidden md:table-cell">
        <ComponentScoreCell value={row.scoreEngagement} />
      </td>
      <td className="px-3 py-2.5 text-center hidden md:table-cell">
        <ComponentScoreCell value={row.scoreCompliance} />
      </td>
      <td className="px-3 py-2.5 text-right hidden lg:table-cell font-mono text-content-secondary">{row.tauxRemboursement ? `${parseFloat(row.tauxRemboursement).toFixed(0)}%` : '-'}</td>
      <td className="px-3 py-2.5 text-right hidden lg:table-cell font-mono text-content-secondary">{row.totalPointsFidelite ?? 0}</td>
    </tr>
  );
}

function ComponentScoreCell({ value }: { value: number }) {
  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <span className={`font-mono text-xs font-medium ${scoreColor(value)}`}>{value}</span>
      <div className="w-8 h-1 rounded-full bg-surface-subtle overflow-hidden">
        <div
          className={`h-full rounded-full ${scoreBarColor(value)}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// STATS TAB (Agency Stats)
// ============================================================================

function StatsTab() {
  const { data: stats, isLoading } = useQuery({
    queryKey: scoreKeys.agencyStats(),
    queryFn: () => clientApi.getAgencyScoreStats(),
    staleTime: 2 * 60 * 1000,
  });

  const { data: agences } = useQuery({
    queryKey: ['agences'],
    queryFn: () => agencesApi.getAgences(),
    staleTime: 5 * 60 * 1000,
  });

  // Build agency name lookup
  const agenceNames = useMemo(() => {
    const map = new Map<string, string>();
    if (agences) agences.forEach(a => map.set(a.id, a.nom));
    return map;
  }, [agences]);

  function handleExportCsv() {
    window.open(scoringAdminApi.exportAgencyStatsUrl(), '_blank');
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>;
  }

  if (!stats || stats.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Aucune statistique"
        description="Aucun score n'a encore été calculé pour les agences."
      />
    );
  }

  // Global summary across all agencies
  const globalSummary = useMemo(() => {
    let totalClients = 0;
    let scoreSum = 0;
    for (const s of stats) {
      totalClients += s.totalClients;
      scoreSum += s.avgScore * s.totalClients;
    }
    return {
      totalClients,
      avgScore: totalClients > 0 ? Math.round(scoreSum / totalClients) : 0,
      agenceCount: stats.length,
    };
  }, [stats]);

  return (
    <>
      {/* Global summary */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard
          title="Agences"
          value={globalSummary.agenceCount}
          icon={Building2}
          color="primary"
        />
        <StatCard
          title="Total clients"
          value={globalSummary.totalClients}
          icon={Users}
          color="neutral"
        />
        <StatCard
          title="Score moyen"
          value={globalSummary.avgScore}
          icon={TrendingUp}
          color={globalSummary.avgScore >= 65 ? 'success' : globalSummary.avgScore >= 40 ? 'warning' : 'danger'}
        />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-content-primary">Détail par agence</h3>
        <Button variant="ghost" size="sm" onClick={handleExportCsv}>
          <Download size={14} />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => (
          <AgencyStatsCard key={stat.agenceId} stat={stat} agenceName={agenceNames.get(stat.agenceId) || null} />
        ))}
      </div>
    </>
  );
}

function AgencyStatsCard({ stat, agenceName }: { stat: AgencyScoreStats; agenceName: string | null }) {
  const total = stat.totalClients || 1;

  function pct(n: number) {
    return Math.round((n / total) * 100);
  }

  const components = [
    { label: 'Paiement', value: stat.avgPayment, weight: '40%' },
    { label: 'Fidélité', value: stat.avgLoyalty, weight: '30%' },
    { label: 'Engagement', value: stat.avgEngagement, weight: '20%' },
    { label: 'Conformité', value: stat.avgCompliance, weight: '10%' },
  ];

  return (
    <Card variant="default" padding="none" className="overflow-hidden">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className="shrink-0 p-1.5 rounded-lg bg-accent/10">
            <Building2 size={16} className="text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-content-primary truncate">
              {agenceName || stat.agenceId?.slice(0, 8) || 'Global'}
            </h3>
            <p className="text-[10px] text-content-muted">
              {stat.totalClients} client{stat.totalClients > 1 ? 's' : ''}
            </p>
          </div>
          <span className={`text-xl font-bold font-mono ${scoreColor(stat.avgScore)}`}>{stat.avgScore}</span>
        </div>

        {/* Segment distribution bar */}
        <div className="flex rounded-full overflow-hidden h-2 mb-1.5">
          {stat.segments.VIP > 0 && <div className="bg-status-success transition-all" style={{ width: `${pct(stat.segments.VIP)}%` }} title={`VIP: ${stat.segments.VIP}`} />}
          {stat.segments.Premium > 0 && <div className="bg-status-info transition-all" style={{ width: `${pct(stat.segments.Premium)}%` }} title={`Premium: ${stat.segments.Premium}`} />}
          {stat.segments.Standard > 0 && <div className="bg-accent transition-all" style={{ width: `${pct(stat.segments.Standard)}%` }} title={`Standard: ${stat.segments.Standard}`} />}
          {stat.segments.Risque > 0 && <div className="bg-status-danger transition-all" style={{ width: `${pct(stat.segments.Risque)}%` }} title={`Risque: ${stat.segments.Risque}`} />}
        </div>

        {/* Segment legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-content-muted mb-3">
          <span><span className="inline-block w-2 h-2 rounded-full bg-status-success mr-1" />VIP {stat.segments.VIP} ({pct(stat.segments.VIP)}%)</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-status-info mr-1" />Premium {stat.segments.Premium} ({pct(stat.segments.Premium)}%)</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-accent mr-1" />Standard {stat.segments.Standard} ({pct(stat.segments.Standard)}%)</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-status-danger mr-1" />Risque {stat.segments.Risque} ({pct(stat.segments.Risque)}%)</span>
        </div>

        {/* Component averages with bars */}
        <div className="space-y-2">
          {components.map(comp => (
            <div key={comp.label} className="flex items-center gap-2">
              <span className="text-[10px] text-content-muted w-16 shrink-0">{comp.label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-surface-subtle overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${scoreBarColor(comp.value)}`}
                  style={{ width: `${Math.min(comp.value, 100)}%` }}
                />
              </div>
              <span className={`text-[11px] font-mono font-medium min-w-[24px] text-right ${scoreColor(comp.value)}`}>{comp.value}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
