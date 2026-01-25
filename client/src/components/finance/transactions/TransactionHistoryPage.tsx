import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Search,
  Filter,
  Calendar,
  ArrowUpDown,
  Download,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  FileSpreadsheet,
  ChevronDown,
  Clock,
  SlidersHorizontal
} from 'lucide-react';
import { Button, EmptyState } from '../../ui';
import { ALL_STATUS_LABELS } from '@/lib/status-labels';
import TransactionsList, { TransactionItem } from './TransactionsList';
import TransactionDetailDrawer, { TransactionDetails } from './TransactionDetailDrawer';
import { isIncomingOperation } from '@shared/config/caisse-operations';

// --- Types ---

export interface FilterState {
  search: string;
  type: 'all' | 'entrees' | 'sorties';
  status: 'all' | 'completed' | 'pending' | 'failed';
  dateFrom: string;
  dateTo: string;
  sortBy: 'date' | 'amount';
  sortOrder: 'asc' | 'desc';
}

export interface TransactionHistoryPageProps {
  transactions?: TransactionItem[];
  isLoading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  onRefresh?: () => void;
  onExport?: (filtered: TransactionItem[]) => void;
  onBack?: () => void;
}

// --- Quick Filter Chips ---

const QUICK_FILTERS = [
  { key: 'all', label: 'Tous' },
  { key: 'entrees', label: 'Entrées' },
  { key: 'sorties', label: 'Sorties' },
  { key: 'today', label: "Aujourd'hui" },
  { key: 'yesterday', label: 'Hier' },
  { key: 'week', label: 'Cette semaine' },
] as const;

// --- Helper Functions ---

/** French keywords for legacy data compatibility */
const FR_ENTREE_KEYWORDS = [
  'dépôt', 'versement', 'remboursement', 'encaissement',
  'cotisation', 'approvisionnement', 'frais engagement',
  'activation', 'credit'
];

/**
 * Détermine si une opération est une entrée (crédit pour la caisse)
 * Utilise la config partagée + fallback sur les labels FR
 */
const isEntree = (type: string): boolean => {
  // 1. Check shared config (EN operation types)
  if (isIncomingOperation(type)) {
    return true;
  }
  // 2. Fallback: check French keywords for legacy data
  const typeLower = type.toLowerCase();
  return FR_ENTREE_KEYWORDS.some(keyword => typeLower.includes(keyword));
};

const getToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const getYesterday = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  return yesterday;
};

const getWeekStart = () => {
  const date = new Date();
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

// --- Component ---

export default function TransactionHistoryPage({
  transactions = [],
  isLoading = false,
  onLoadMore,
  hasMore = false,
  onRefresh,
  onExport,
  onBack
}: TransactionHistoryPageProps) {
  // State
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    type: 'all',
    status: 'all',
    dateFrom: '',
    dateTo: '',
    sortBy: 'date',
    sortOrder: 'desc'
  });
  const [showFilters, setShowFilters] = useState(false);
  const [activeQuickFilter, setActiveQuickFilter] = useState<string>('all');
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionDetails | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Refs for infinite scroll
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle filter updates
  const updateFilter = useCallback((key: keyof FilterState, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setActiveQuickFilter('custom');
  }, []);

  // Handle quick filter selection
  const handleQuickFilter = useCallback((key: string) => {
    setActiveQuickFilter(key);

    const today = getToday();
    const yesterday = getYesterday();
    const weekStart = getWeekStart();

    switch (key) {
      case 'all':
        setFilters(prev => ({ ...prev, type: 'all', dateFrom: '', dateTo: '' }));
        break;
      case 'entrees':
        setFilters(prev => ({ ...prev, type: 'entrees', dateFrom: '', dateTo: '' }));
        break;
      case 'sorties':
        setFilters(prev => ({ ...prev, type: 'sorties', dateFrom: '', dateTo: '' }));
        break;
      case 'today':
        setFilters(prev => ({
          ...prev,
          type: 'all',
          dateFrom: today.toISOString().split('T')[0],
          dateTo: today.toISOString().split('T')[0]
        }));
        break;
      case 'yesterday':
        setFilters(prev => ({
          ...prev,
          type: 'all',
          dateFrom: yesterday.toISOString().split('T')[0],
          dateTo: yesterday.toISOString().split('T')[0]
        }));
        break;
      case 'week':
        setFilters(prev => ({
          ...prev,
          type: 'all',
          dateFrom: weekStart.toISOString().split('T')[0],
          dateTo: today.toISOString().split('T')[0]
        }));
        break;
    }
  }, []);

  // Reset filters
  const resetFilters = useCallback(() => {
    setFilters({
      search: '',
      type: 'all',
      status: 'all',
      dateFrom: '',
      dateTo: '',
      sortBy: 'date',
      sortOrder: 'desc'
    });
    setActiveQuickFilter('all');
  }, []);

  // Filtered and sorted transactions
  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(t =>
        (t.description?.toLowerCase().includes(searchLower)) ||
        (t.reference?.toLowerCase().includes(searchLower)) ||
        (t.client?.name?.toLowerCase().includes(searchLower)) ||
        (t.type?.toLowerCase().includes(searchLower))
      );
    }

    // Type filter
    if (filters.type !== 'all') {
      result = result.filter(t => {
        const type = t.type_operation || t.type;
        const transactionIsEntree = isEntree(type);
        return filters.type === 'entrees' ? transactionIsEntree : !transactionIsEntree;
      });
    }

    // Status filter
    if (filters.status !== 'all') {
      result = result.filter(t => {
        const status = t.status.toLowerCase();
        if (filters.status === 'completed') return status === 'succès' || status === 'completed' || status === 'success';
        if (filters.status === 'pending') return status === 'en attente' || status === 'pending';
        if (filters.status === 'failed') return status === 'échec' || status === 'failed';
        return true;
      });
    }

    // Date filters
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      result = result.filter(t => {
        const txDate = new Date(t.created_at || t.date);
        return txDate >= fromDate;
      });
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      result = result.filter(t => {
        const txDate = new Date(t.created_at || t.date);
        return txDate <= toDate;
      });
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      if (filters.sortBy === 'date') {
        const dateA = new Date(a.created_at || a.date).getTime();
        const dateB = new Date(b.created_at || b.date).getTime();
        comparison = dateA - dateB;
      } else if (filters.sortBy === 'amount') {
        comparison = a.amount - b.amount;
      }
      return filters.sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [transactions, filters]);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.type !== 'all') count++;
    if (filters.status !== 'all') count++;
    if (filters.dateFrom) count++;
    if (filters.dateTo) count++;
    if (filters.search) count++;
    return count;
  }, [filters]);

  // Handle transaction click
  const handleTransactionClick = useCallback((transaction: TransactionItem) => {
    setSelectedTransaction(transaction as unknown as TransactionDetails);
    setIsDrawerOpen(true);
  }, []);

  // Handle export
  const handleExport = useCallback(() => {
    if (onExport) {
      onExport(filteredTransactions);
    } else {
      // Default CSV export
      const csvContent = [
        'Date,Référence,Type,Description,Montant,Statut',
        ...filteredTransactions.map(t => {
          const date = new Date(t.created_at || t.date).toLocaleDateString('fr-FR');
          const type = t.type_operation || t.type;
          return `${date},${t.reference || ''},"${type}","${t.description || ''}",${t.amount},${ALL_STATUS_LABELS[t.status] || t.status}`;
        })
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }, [filteredTransactions, onExport]);

  // Infinite scroll observer
  useEffect(() => {
    if (!loadMoreRef.current || !onLoadMore || !hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [onLoadMore, hasMore, isLoading]);

  // Calculate totals
  const totals = useMemo(() => {
    const entrees = filteredTransactions
      .filter(t => isEntree(t.type_operation || t.type))
      .reduce((sum, t) => sum + t.amount, 0);
    const sorties = filteredTransactions
      .filter(t => !isEntree(t.type_operation || t.type))
      .reduce((sum, t) => sum + t.amount, 0);
    return { entrees, sorties, net: entrees - sorties };
  }, [filteredTransactions]);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount);
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-[#020617] flex flex-col">
      {/* Sticky Header / Toolbar */}
      <div className="sticky top-0 z-30 bg-[#020617]/95 backdrop-blur-xl border-b border-slate-800">
        {/* Title Bar */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 -ml-2 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <ChevronDown size={20} className="text-slate-400 rotate-90" />
              </button>
            )}
            <div>
              <h1 className="text-lg font-bold text-white">Historique</h1>
              <p className="text-xs text-slate-500">
                {filteredTransactions.length} transaction{filteredTransactions.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                className="p-2 rounded-lg"
                disabled={isLoading}
              >
                <RefreshCw size={18} className={`text-slate-400 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              className="p-2 rounded-lg"
            >
              <FileSpreadsheet size={18} className="text-slate-400" />
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              type="text"
              placeholder="Rechercher par nom, référence..."
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-sm"
            />
            {filters.search && (
              <button
                onClick={() => updateFilter('search', '')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-700"
              >
                <X size={14} className="text-slate-400" />
              </button>
            )}
          </div>
        </div>

        {/* Quick Filter Chips */}
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
          {QUICK_FILTERS.map((filter) => (
            <button
              key={filter.key}
              onClick={() => handleQuickFilter(filter.key)}
              className={`
                shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all
                ${activeQuickFilter === filter.key
                  ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700'
                }
              `}
            >
              {filter.label}
            </button>
          ))}

          {/* Advanced Filters Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`
              shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5
              ${showFilters || activeFiltersCount > 0
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
              }
            `}
          >
            <SlidersHorizontal size={12} />
            Filtres
            {activeFiltersCount > 0 && (
              <span className="ml-0.5 w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {/* Advanced Filters Panel */}
        {showFilters && (
          <div className="px-4 pb-4 border-t border-slate-800 pt-4 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">Filtres avancés</span>
              <button
                onClick={resetFilters}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <X size={12} />
                Réinitialiser
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Status Filter */}
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Statut</label>
                <select
                  value={filters.status}
                  onChange={(e) => updateFilter('status', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  <option value="all">Tous</option>
                  <option value="completed">Succès</option>
                  <option value="pending">En attente</option>
                  <option value="failed">Échec</option>
                </select>
              </div>

              {/* Sort */}
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Trier par</label>
                <div className="flex gap-2">
                  <select
                    value={filters.sortBy}
                    onChange={(e) => updateFilter('sortBy', e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  >
                    <option value="date">Date</option>
                    <option value="amount">Montant</option>
                  </select>
                  <button
                    onClick={() => updateFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white hover:bg-slate-700 transition-colors"
                  >
                    <ArrowUpDown size={16} className={filters.sortOrder === 'asc' ? '' : 'rotate-180'} />
                  </button>
                </div>
              </div>

              {/* Date From */}
              <div>
                <label className="block text-xs text-slate-500 mb-1.5 flex items-center gap-1">
                  <Calendar size={12} />
                  Date début
                </label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => updateFilter('dateFrom', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-xs text-slate-500 mb-1.5 flex items-center gap-1">
                  <Calendar size={12} />
                  Date fin
                </label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => updateFilter('dateTo', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>
            </div>
          </div>
        )}

        {/* Summary Stats Bar */}
        {filteredTransactions.length > 0 && (
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
            <div className="shrink-0 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-2">
                <ArrowDownLeft size={14} className="text-emerald-400" />
                <span className="text-xs text-emerald-400">Entrées</span>
              </div>
              <p className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
                +{formatMoney(totals.entrees)}
              </p>
            </div>
            <div className="shrink-0 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-center gap-2">
                <ArrowUpRight size={14} className="text-red-400" />
                <span className="text-xs text-red-400">Sorties</span>
              </div>
              <p className="text-sm font-bold text-red-400 font-mono mt-0.5">
                -{formatMoney(totals.sorties)}
              </p>
            </div>
            <div className="shrink-0 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-cyan-400" />
                <span className="text-xs text-cyan-400">Solde net</span>
              </div>
              <p className={`text-sm font-bold font-mono mt-0.5 ${totals.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totals.net >= 0 ? '+' : ''}{formatMoney(totals.net)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Transaction List */}
      <div className="flex-1 px-4 py-4">
        {filteredTransactions.length === 0 && !isLoading ? (
          <EmptyState
            icon={Filter}
            title="Aucune transaction trouvée"
            description={filters.search || activeFiltersCount > 0
              ? "Essayez de modifier vos filtres de recherche"
              : "Les transactions apparaîtront ici"
            }
            action={activeFiltersCount > 0 ? {
              label: "Réinitialiser les filtres",
              onClick: resetFilters
            } : undefined}
          />
        ) : (
          <>
            <TransactionsList
              transactions={filteredTransactions}
              onTransactionClick={handleTransactionClick}
              isLoading={isLoading && filteredTransactions.length === 0}
              showHeader={false}
              className="mb-4"
            />

            {/* Infinite Scroll Trigger */}
            {hasMore && (
              <div
                ref={loadMoreRef}
                className="flex justify-center py-4"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2 text-slate-500">
                    <RefreshCw size={16} className="animate-spin" />
                    <span className="text-sm">Chargement...</span>
                  </div>
                ) : (
                  <button
                    onClick={onLoadMore}
                    className="px-4 py-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    Charger plus
                  </button>
                )}
              </div>
            )}

            {/* End of list indicator */}
            {!hasMore && filteredTransactions.length > 10 && (
              <p className="text-center text-xs text-slate-600 py-4">
                Fin de la liste
              </p>
            )}
          </>
        )}
      </div>

      {/* Floating Export Button (visible when scrolled) */}
      {filteredTransactions.length > 0 && (
        <button
          onClick={handleExport}
          className="fixed bottom-6 right-6 p-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full shadow-lg shadow-cyan-500/30 transition-all hover:scale-105 z-20 md:hidden"
          aria-label="Exporter en Excel"
        >
          <Download size={20} />
        </button>
      )}

      {/* Transaction Detail Drawer */}
      <TransactionDetailDrawer
        transaction={selectedTransaction}
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setTimeout(() => setSelectedTransaction(null), 300);
        }}
      />
    </div>
  );
}

