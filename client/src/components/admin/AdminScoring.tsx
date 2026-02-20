import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, Download, Filter, TrendingUp,
  ChevronLeft, ChevronRight, Users,
} from 'lucide-react';
import { Card, Button, Badge, SelectField, LoadingSpinner, EmptyState, FeatureHeader } from '../ui';
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

const SEGMENT_OPTIONS = [
  { value: '', label: 'Tous segments' },
  { value: 'VIP', label: 'VIP' },
  { value: 'Premium', label: 'Premium' },
  { value: 'Standard', label: 'Standard' },
  { value: 'Risque', label: 'Risque' },
];

const PAGE_SIZE = 25;

type Tab = 'events' | 'states' | 'stats';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminScoring() {
  const [activeTab, setActiveTab] = useState<Tab>('events');

  return (
    <div className="space-y-4 sm:space-y-6">
      <FeatureHeader
        featureKey="admin.scoring"
        title="Scoring Clients"
        subtitle="Audit log cross-clients, vue d'ensemble des scores et exports"
        icon={<div className="p-2 bg-accent/10 rounded-xl"><BarChart3 className="text-accent" size={22} /></div>}
      />

      {/* Tab bar */}
      <div className="flex gap-1 bg-surface-subtle rounded-lg p-1">
        {([
          { id: 'events' as const, label: 'Journal', icon: Filter },
          { id: 'states' as const, label: 'Scores', icon: TrendingUp },
          { id: 'stats' as const, label: 'Agences', icon: Users },
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

      {activeTab === 'events' && <EventsTab />}
      {activeTab === 'states' && <StatesTab />}
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

  return (
    <>
      {/* Filters */}
      <Card className="bg-surface-base border-edge p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex-1 min-w-[140px]">
            <SelectField
              options={eventTypeOptions}
              value={eventTypeFilter}
              onChange={(e) => { setEventTypeFilter(e.target.value); setFilters(f => ({ ...f, offset: 0 })); }}
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <SelectField
              options={agenceOptions}
              value={agenceFilter}
              onChange={(e) => { setAgenceFilter(e.target.value); setFilters(f => ({ ...f, offset: 0 })); }}
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setFilters(f => ({ ...f, offset: 0 })); }}
              className="w-full px-2.5 py-1.5 text-xs rounded-md border border-input-border bg-input text-content-primary focus:border-input-focus focus:outline-none"
              placeholder="Du"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setFilters(f => ({ ...f, offset: 0 })); }}
              className="w-full px-2.5 py-1.5 text-xs rounded-md border border-input-border bg-input text-content-primary focus:border-input-focus focus:outline-none"
              placeholder="Au"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={handleExportCsv} title="Exporter CSV">
            <Download size={14} />
            CSV
          </Button>
        </div>
      </Card>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          icon={<Filter size={40} />}
          title="Aucun événement scoring"
          description="Aucun événement ne correspond aux filtres sélectionnés."
        />
      ) : (
        <Card className="overflow-hidden border-edge">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-subtle border-b border-edge">
                  <th className="text-left px-3 py-2 font-medium text-content-muted">Date</th>
                  <th className="text-left px-3 py-2 font-medium text-content-muted">Client</th>
                  <th className="text-left px-3 py-2 font-medium text-content-muted">Type</th>
                  <th className="text-right px-3 py-2 font-medium text-content-muted">Points</th>
                  <th className="text-right px-3 py-2 font-medium text-content-muted">Montant</th>
                  <th className="text-left px-3 py-2 font-medium text-content-muted hidden md:table-cell">Motif</th>
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
          <div className="flex items-center justify-between px-3 py-2 bg-surface-subtle border-t border-edge">
            <span className="text-xs text-content-muted">{data.total} événement{data.total > 1 ? 's' : ''}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page === 0}
                className="p-1 rounded hover:bg-surface-elevated disabled:opacity-30"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-content-secondary px-2">{page + 1} / {totalPages || 1}</span>
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages - 1}
                className="p-1 rounded hover:bg-surface-elevated disabled:opacity-30"
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

  return (
    <tr className="hover:bg-surface-subtle/50 transition-colors">
      <td className="px-3 py-2 text-content-secondary whitespace-nowrap">
        {event.createdAt ? new Date(event.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
      </td>
      <td className="px-3 py-2 text-content-primary font-medium">
        {[event.clientPrenom, event.clientNom].filter(Boolean).join(' ') || event.clientId?.slice(0, 8)}
      </td>
      <td className="px-3 py-2">
        <span className="text-content-secondary">{label}</span>
      </td>
      <td className="px-3 py-2 text-right font-mono">
        <span className={isPositive ? 'text-status-success' : isNegative ? 'text-status-danger' : 'text-content-muted'}>
          {isPositive ? '+' : ''}{delta}
        </span>
      </td>
      <td className="px-3 py-2 text-right font-mono text-content-secondary">
        {event.montant ? Number(event.montant).toLocaleString('fr-FR') : '-'}
      </td>
      <td className="px-3 py-2 text-content-muted hidden md:table-cell max-w-[200px] truncate">
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

  return (
    <>
      <Card className="bg-surface-base border-edge p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 min-w-[140px]">
            <SelectField
              options={SEGMENT_OPTIONS}
              value={segmentFilter}
              onChange={(e) => { setSegmentFilter(e.target.value); setFilters(f => ({ ...f, offset: 0 })); }}
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <SelectField
              options={agenceOptions}
              value={agenceFilter}
              onChange={(e) => { setAgenceFilter(e.target.value); setFilters(f => ({ ...f, offset: 0 })); }}
            />
          </div>
          <Button variant="ghost" size="sm" onClick={handleExportCsv} title="Exporter CSV">
            <Download size={14} />
            CSV
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          icon={<TrendingUp size={40} />}
          title="Aucun score calculé"
          description="Aucun client n'a encore de score dans les filtres sélectionnés."
        />
      ) : (
        <Card className="overflow-hidden border-edge">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-subtle border-b border-edge">
                  <th className="text-left px-3 py-2 font-medium text-content-muted">Client</th>
                  <th className="text-center px-3 py-2 font-medium text-content-muted">Score</th>
                  <th className="text-center px-3 py-2 font-medium text-content-muted">Segment</th>
                  <th className="text-center px-3 py-2 font-medium text-content-muted hidden sm:table-cell">Paie.</th>
                  <th className="text-center px-3 py-2 font-medium text-content-muted hidden sm:table-cell">Fidél.</th>
                  <th className="text-center px-3 py-2 font-medium text-content-muted hidden md:table-cell">Engag.</th>
                  <th className="text-center px-3 py-2 font-medium text-content-muted hidden md:table-cell">Conf.</th>
                  <th className="text-right px-3 py-2 font-medium text-content-muted hidden lg:table-cell">Taux R.</th>
                  <th className="text-right px-3 py-2 font-medium text-content-muted hidden lg:table-cell">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge-subtle">
                {data.rows.map((row) => (
                  <StateRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-3 py-2 bg-surface-subtle border-t border-edge">
            <span className="text-xs text-content-muted">{data.total} client{data.total > 1 ? 's' : ''}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => goToPage(page - 1)} disabled={page === 0} className="p-1 rounded hover:bg-surface-elevated disabled:opacity-30">
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-content-secondary px-2">{page + 1} / {totalPages || 1}</span>
              <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages - 1} className="p-1 rounded hover:bg-surface-elevated disabled:opacity-30">
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

  function scoreColor(val: number) {
    if (val >= 80) return 'text-status-success';
    if (val >= 65) return 'text-status-info';
    if (val >= 40) return 'text-status-warning';
    return 'text-status-danger';
  }

  return (
    <tr className="hover:bg-surface-subtle/50 transition-colors">
      <td className="px-3 py-2 text-content-primary font-medium">
        {[row.clientPrenom, row.clientNom].filter(Boolean).join(' ') || row.clientId?.slice(0, 8)}
      </td>
      <td className="px-3 py-2 text-center">
        <span className={`font-bold font-mono ${scoreColor(row.scoreGlobal)}`}>{row.scoreGlobal}</span>
      </td>
      <td className="px-3 py-2 text-center">
        <Badge className={`text-[10px] ${segmentCls}`}>{row.segment}</Badge>
      </td>
      <td className="px-3 py-2 text-center hidden sm:table-cell font-mono text-content-secondary">{row.scorePayment}</td>
      <td className="px-3 py-2 text-center hidden sm:table-cell font-mono text-content-secondary">{row.scoreLoyalty}</td>
      <td className="px-3 py-2 text-center hidden md:table-cell font-mono text-content-secondary">{row.scoreEngagement}</td>
      <td className="px-3 py-2 text-center hidden md:table-cell font-mono text-content-secondary">{row.scoreCompliance}</td>
      <td className="px-3 py-2 text-right hidden lg:table-cell font-mono text-content-secondary">{row.tauxRemboursement ? `${parseFloat(row.tauxRemboursement).toFixed(0)}%` : '-'}</td>
      <td className="px-3 py-2 text-right hidden lg:table-cell font-mono text-content-secondary">{row.totalPointsFidelite ?? 0}</td>
    </tr>
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

  function handleExportCsv() {
    window.open(scoringAdminApi.exportAgencyStatsUrl(), '_blank');
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>;
  }

  if (!stats || stats.length === 0) {
    return (
      <EmptyState
        icon={<Users size={40} />}
        title="Aucune statistique"
        description="Aucun score n'a encore été calculé pour les agences."
      />
    );
  }

  return (
    <>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={handleExportCsv}>
          <Download size={14} />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => (
          <AgencyStatsCard key={stat.agenceId} stat={stat} />
        ))}
      </div>
    </>
  );
}

function AgencyStatsCard({ stat }: { stat: AgencyScoreStats }) {
  const total = stat.totalClients || 1;

  function pct(n: number) {
    return Math.round((n / total) * 100);
  }

  function scoreColor(val: number) {
    if (val >= 80) return 'text-status-success';
    if (val >= 65) return 'text-status-info';
    if (val >= 40) return 'text-status-warning';
    return 'text-status-danger';
  }

  return (
    <Card variant="default" padding="none" className="overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-content-primary truncate">
            {stat.agenceId?.slice(0, 8) || 'Global'}
          </h3>
          <span className={`text-lg font-bold font-mono ${scoreColor(stat.avgScore)}`}>{stat.avgScore}</span>
        </div>

        {/* Segment distribution bar */}
        <div className="flex rounded-full overflow-hidden h-2 mb-2">
          {stat.segments.VIP > 0 && <div className="bg-status-success" style={{ width: `${pct(stat.segments.VIP)}%` }} />}
          {stat.segments.Premium > 0 && <div className="bg-status-info" style={{ width: `${pct(stat.segments.Premium)}%` }} />}
          {stat.segments.Standard > 0 && <div className="bg-accent" style={{ width: `${pct(stat.segments.Standard)}%` }} />}
          {stat.segments.Risque > 0 && <div className="bg-status-danger" style={{ width: `${pct(stat.segments.Risque)}%` }} />}
        </div>

        {/* Segment legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-content-muted mb-3">
          <span><span className="inline-block w-2 h-2 rounded-full bg-status-success mr-1" />VIP {stat.segments.VIP}</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-status-info mr-1" />Premium {stat.segments.Premium}</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-accent mr-1" />Standard {stat.segments.Standard}</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-status-danger mr-1" />Risque {stat.segments.Risque}</span>
        </div>

        {/* Component averages */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between"><span className="text-content-muted">Paiement</span><span className="font-mono">{stat.avgPayment}</span></div>
          <div className="flex justify-between"><span className="text-content-muted">Fidélité</span><span className="font-mono">{stat.avgLoyalty}</span></div>
          <div className="flex justify-between"><span className="text-content-muted">Engagement</span><span className="font-mono">{stat.avgEngagement}</span></div>
          <div className="flex justify-between"><span className="text-content-muted">Conformité</span><span className="font-mono">{stat.avgCompliance}</span></div>
        </div>

        <div className="mt-2 pt-2 border-t border-edge-subtle flex items-center justify-between text-xs text-content-muted">
          <span>{stat.totalClients} client{stat.totalClients > 1 ? 's' : ''}</span>
        </div>
      </div>
    </Card>
  );
}
