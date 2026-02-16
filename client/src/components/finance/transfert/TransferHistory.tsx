import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, Calendar, TrendingUp, TrendingDown,
  ArrowUpDown, RotateCcw, CheckCircle2, Ban, Send
} from 'lucide-react';
import { Badge, SearchInput, Pagination, EmptyState } from '../../ui';
import { Skeleton } from '../../ui/Skeleton';
import { compteEpargneApi } from '../../../lib/api-client';
import { formatMoney, formatMoneyShort } from '@shared/config/currency';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import TransferDetailDrawer, { type TransferRecord } from './TransferDetailDrawer';

export default function TransferHistory() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statut, setStatut] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedTransfer, setSelectedTransfer] = useState<TransferRecord | null>(null);
  const limit = 15;

  // Debounce search
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout>>();
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(e.target.value);
      setPage(1);
    }, 400);
  };

  // Stats query
  const statsQuery = useQuery({
    queryKey: ['transfer-stats'],
    queryFn: () => compteEpargneApi.getTransferStats(),
    staleTime: 30_000,
  });

  // History query
  const historyQuery = useQuery({
    queryKey: ['transfer-history', page, limit, debouncedSearch, statut, dateFrom, dateTo],
    queryFn: () => compteEpargneApi.getTransferHistory({
      page,
      limit,
      search: debouncedSearch || undefined,
      statut: statut || undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
    }),
  });

  const transfers = historyQuery.data?.data || [];
  const pagination = historyQuery.data?.pagination;
  const stats = statsQuery.data;

  const hasActiveFilters = !!statut || !!dateFrom || !!dateTo || !!debouncedSearch;

  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setStatut('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* KPI Summary Bar */}
      <div className="shrink-0 px-2 sm:px-4 pt-2 pb-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <KpiCard
            label="Total virements"
            value={stats ? String(stats.totalCount) : '-'}
            icon={ArrowUpDown}
            loading={statsQuery.isLoading}
          />
          <KpiCard
            label="Volume total"
            value={stats ? formatMoneyShort(stats.totalAmount) : '-'}
            icon={Send}
            loading={statsQuery.isLoading}
          />
          <KpiCard
            label="Ce mois"
            value={stats ? String(stats.monthCount) : '-'}
            subtitle={stats ? formatMoneyShort(stats.monthAmount) : undefined}
            icon={Calendar}
            trend={stats?.trend}
            trendUp={stats?.trendUp}
            loading={statsQuery.isLoading}
          />
          <KpiCard
            label="Annulés"
            value={stats ? String(stats.reversedCount) : '-'}
            icon={RotateCcw}
            variant="danger"
            loading={statsQuery.isLoading}
          />
        </div>
      </div>

      {/* Filter Bar */}
      <div className="shrink-0 px-2 sm:px-4 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[180px] max-w-xs">
            <SearchInput
              value={search}
              onChange={handleSearchChange}
              onClear={() => { setSearch(''); setDebouncedSearch(''); setPage(1); }}
              placeholder="Réf, compte, nom..."
              className="h-8 text-xs"
            />
          </div>
          <select
            value={statut}
            onChange={(e) => { setStatut(e.target.value); setPage(1); }}
            className="h-8 px-2 text-xs rounded-lg border border-edge bg-input text-content-primary focus:border-input-focus outline-none"
          >
            <option value="">Tous statuts</option>
            <option value="POSTED">Validé</option>
            <option value="REVERSED">Annulé</option>
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="h-8 px-2 text-xs rounded-lg border border-edge bg-input text-content-primary focus:border-input-focus outline-none"
            placeholder="Du"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="h-8 px-2 text-xs rounded-lg border border-edge bg-input text-content-primary focus:border-input-focus outline-none"
            placeholder="Au"
          />
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="h-8 px-3 text-xs rounded-lg text-status-danger hover:bg-status-danger-bg transition-colors"
            >
              Effacer
            </button>
          )}
        </div>
      </div>

      {/* Transfer List */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-2 sm:px-4">
        {historyQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-edge-subtle">
                <Skeleton variant="circular" width={36} height={36} />
                <div className="flex-1 space-y-1.5">
                  <Skeleton variant="text" width="60%" height={14} />
                  <Skeleton variant="text" width="40%" height={10} />
                </div>
                <Skeleton variant="text" width={80} height={16} />
              </div>
            ))}
          </div>
        ) : historyQuery.isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-status-danger-bg flex items-center justify-center mb-4">
              <Ban size={28} className="text-status-danger" />
            </div>
            <h3 className="text-lg font-bold text-content-primary mb-1">Erreur de chargement</h3>
            <p className="text-sm text-content-muted mb-4">Impossible de récupérer l'historique des virements.</p>
            <button
              onClick={() => historyQuery.refetch()}
              className="px-4 py-2 text-sm rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              Réessayer
            </button>
          </div>
        ) : transfers.length === 0 ? (
          <EmptyState
            icon={Send}
            title={hasActiveFilters ? 'Aucun résultat' : 'Aucun virement'}
            description={
              hasActiveFilters
                ? 'Aucun virement ne correspond à vos critères de recherche.'
                : 'Aucun virement interne n\'a encore été effectué.'
            }
            action={hasActiveFilters ? { label: 'Effacer les filtres', onClick: clearFilters } : undefined}
          />
        ) : (
          <div className="space-y-1.5">
            {transfers.map((t) => (
              <TransferRow
                key={t.id}
                transfer={t}
                onClick={() => setSelectedTransfer(t)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="shrink-0 px-2 sm:px-4 py-2 border-t border-edge-subtle">
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
            canGoNext={pagination.page < pagination.totalPages}
            canGoPrevious={pagination.page > 1}
            totalItems={pagination.total}
            itemsPerPage={pagination.limit}
          />
        </div>
      )}

      {/* Detail Drawer */}
      <TransferDetailDrawer
        open={!!selectedTransfer}
        onClose={() => setSelectedTransfer(null)}
        transfer={selectedTransfer}
      />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function TransferRow({ transfer, onClick }: { transfer: TransferRecord; onClick: () => void }) {
  const montant = Number(transfer.montant) || 0;
  const sourceName = [transfer.sourceUserPrenom, transfer.sourceUserNom].filter(Boolean).join(' ') || '—';
  const destName = [transfer.destUserPrenom, transfer.destUserNom].filter(Boolean).join(' ') || '—';
  const isReversed = transfer.statut === 'REVERSED';
  const date = new Date(transfer.dateOperation);

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 p-2.5 sm:p-3 rounded-xl bg-surface hover:bg-surface-elevated border border-edge-subtle hover:border-edge transition-all group cursor-pointer"
    >
      {/* Status icon */}
      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
        isReversed ? 'bg-status-danger-bg' : 'bg-status-success-bg'
      }`}>
        {isReversed ? (
          <RotateCcw size={15} className="text-status-danger" />
        ) : (
          <CheckCircle2 size={15} className="text-status-success" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs sm:text-sm">
          <span className="font-medium text-content-primary truncate max-w-[100px] sm:max-w-[140px]">{sourceName}</span>
          <ArrowRight size={12} className="text-content-muted shrink-0" />
          <span className="font-medium text-content-primary truncate max-w-[100px] sm:max-w-[140px]">{destName}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-content-muted font-mono">{transfer.reference.slice(0, 20)}</span>
          <span className="text-[10px] text-content-muted hidden sm:inline">
            {format(date, 'dd MMM yyyy HH:mm', { locale: fr })}
          </span>
          <span className="text-[10px] text-content-muted sm:hidden">
            {format(date, 'dd/MM/yy', { locale: fr })}
          </span>
        </div>
      </div>

      {/* Amount + status */}
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold ${isReversed ? 'text-status-danger line-through' : 'text-content-primary'}`}>
          {formatMoney(montant)}
        </p>
        <Badge
          value={isReversed ? 'Annulé' : 'Validé'}
          variant={isReversed ? 'danger' : 'success'}
          size="xs"
        />
      </div>
    </button>
  );
}

function KpiCard({ label, value, subtitle, icon: Icon, trend, trendUp, variant, loading }: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  trend?: number;
  trendUp?: boolean;
  variant?: 'danger';
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-edge-subtle bg-surface p-3">
        <Skeleton variant="text" width="50%" height={10} />
        <Skeleton variant="text" width="70%" height={20} className="mt-1.5" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-edge-subtle bg-surface p-2.5 sm:p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] sm:text-xs text-content-muted font-medium uppercase tracking-wider">{label}</span>
        <Icon size={14} className={variant === 'danger' ? 'text-status-danger' : 'text-accent'} />
      </div>
      <p className={`text-base sm:text-lg font-bold ${variant === 'danger' ? 'text-status-danger' : 'text-content-primary'}`}>
        {value}
      </p>
      <div className="flex items-center gap-1 mt-0.5">
        {subtitle && (
          <span className="text-[10px] text-content-muted">{subtitle}</span>
        )}
        {trend !== undefined && trend !== 0 && (
          <span className={`text-[10px] font-medium flex items-center gap-0.5 ${trendUp ? 'text-status-success' : 'text-status-danger'}`}>
            {trendUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
    </div>
  );
}
