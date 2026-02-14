import React, { useState, useMemo } from 'react';
import { Search, Filter, Calendar, ArrowUpDown, X, Download } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { ALL_STATUS_LABELS } from '@/lib/status-labels';

interface Transaction {
  id: number;
  date: string;
  type: 'credit' | 'debit' | 'transfer' | 'fee';
  category: string;
  amount: number;
  description: string;
  status: 'completed' | 'pending' | 'failed';
  reference?: string;
}

interface TransactionSearchProps {
  transactions?: Transaction[];
  onFilterChange?: (filters: FilterState) => void;
}

interface FilterState {
  search: string;
  type: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  minAmount: string;
  maxAmount: string;
  category: string;
  sortBy: 'date' | 'amount' | 'type';
  sortOrder: 'asc' | 'desc';
}

const mockTransactions: Transaction[] = [
  { id: 1, date: '2024-12-14', type: 'credit', category: 'Remboursement', amount: 150000, description: 'Remboursement crédit #1234', status: 'completed', reference: 'TXN001' },
  { id: 2, date: '2024-12-13', type: 'debit', category: 'Décaissement', amount: 500000, description: 'Décaissement crédit #5678', status: 'completed', reference: 'TXN002' },
  { id: 3, date: '2024-12-12', type: 'credit', category: 'Dépôt', amount: 75000, description: 'Dépôt épargne', status: 'completed', reference: 'TXN003' },
  { id: 4, date: '2024-12-11', type: 'debit', category: 'Retrait', amount: 25000, description: 'Retrait épargne', status: 'pending', reference: 'TXN004' },
  { id: 5, date: '2024-12-10', type: 'fee', category: 'Frais', amount: 5000, description: 'Frais de gestion', status: 'completed', reference: 'TXN005' },
  { id: 6, date: '2024-12-09', type: 'transfer', category: 'Virement', amount: 200000, description: 'Virement interne', status: 'failed', reference: 'TXN006' },
];

export default function TransactionSearch({
  transactions = mockTransactions,
  onFilterChange
}: TransactionSearchProps) {
  const { t } = useLanguage();
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const handleExport = (data: Transaction[]) => {
    const csvContent = [
      'Date,Référence,Type,Catégorie,Description,Montant,Statut',
      ...data.map(t => 
        `${t.date},${t.reference || ''},${t.type},${t.category},"${t.description}",${t.amount},${ALL_STATUS_LABELS[t.status] || t.status}`
      )
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

    setExportMessage(`${data.length} transaction(s) exportée(s)`);
    setTimeout(() => setExportMessage(null), 3000);
  };
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    type: 'all',
    status: 'all',
    dateFrom: '',
    dateTo: '',
    minAmount: '',
    maxAmount: '',
    category: 'all',
    sortBy: 'date',
    sortOrder: 'desc'
  });

  const updateFilter = (key: keyof FilterState, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilterChange?.(newFilters);
  };

  const resetFilters = () => {
    const defaultFilters: FilterState = {
      search: '',
      type: 'all',
      status: 'all',
      dateFrom: '',
      dateTo: '',
      minAmount: '',
      maxAmount: '',
      category: 'all',
      sortBy: 'date',
      sortOrder: 'desc'
    };
    setFilters(defaultFilters);
    onFilterChange?.(defaultFilters);
  };

  const categories = useMemo(() => {
    const cats = Array.from(new Set(transactions.map(t => t.category)));
    return cats;
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(t =>
        t.description.toLowerCase().includes(searchLower) ||
        t.reference?.toLowerCase().includes(searchLower) ||
        t.category.toLowerCase().includes(searchLower)
      );
    }

    if (filters.type !== 'all') {
      result = result.filter(t => t.type === filters.type);
    }

    if (filters.status !== 'all') {
      result = result.filter(t => t.status === filters.status);
    }

    if (filters.category !== 'all') {
      result = result.filter(t => t.category === filters.category);
    }

    if (filters.dateFrom) {
      result = result.filter(t => t.date >= filters.dateFrom);
    }

    if (filters.dateTo) {
      result = result.filter(t => t.date <= filters.dateTo);
    }

    if (filters.minAmount) {
      result = result.filter(t => t.amount >= parseFloat(filters.minAmount));
    }

    if (filters.maxAmount) {
      result = result.filter(t => t.amount <= parseFloat(filters.maxAmount));
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (filters.sortBy) {
        case 'date':
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case 'amount':
          comparison = a.amount - b.amount;
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
      }
      return filters.sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [transactions, filters]);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'credit': return 'text-status-success bg-status-success-bg';
      case 'debit': return 'text-status-danger bg-status-danger-bg';
      case 'transfer': return 'text-accent bg-accent/10';
      case 'fee': return 'text-status-warning bg-status-warning-bg';
      default: return 'text-content-muted bg-surface-subtle/10';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-status-success';
      case 'pending': return 'text-status-warning';
      case 'failed': return 'text-status-danger';
      default: return 'text-content-muted';
    }
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.type !== 'all') count++;
    if (filters.status !== 'all') count++;
    if (filters.category !== 'all') count++;
    if (filters.dateFrom) count++;
    if (filters.dateTo) count++;
    if (filters.minAmount) count++;
    if (filters.maxAmount) count++;
    return count;
  }, [filters]);

  return (
    <div className="bg-gradient-to-br from-surface to-surface-base border border-edge rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-content-primary flex items-center gap-2">
          <Search className="text-accent" size={24} />
          {t('rechercheTransactions')}
        </h3>
        <div className="flex items-center gap-3">
          {exportMessage && (
            <span className="text-status-success text-sm">{exportMessage}</span>
          )}
          <button
            onClick={() => handleExport(filteredTransactions)}
            className="flex items-center gap-2 px-4 py-2 bg-accent-secondary hover:bg-accent-secondary-hover text-content-primary rounded-lg transition-colors"
            data-testid="button-export-transactions"
          >
            <Download size={18} />
            {t('exporterCSV')}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={20} />
            <input
              type="text"
              placeholder={t('rechercherParDescription')}
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-surface-elevated/50 border border-edge-strong rounded-lg text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              data-testid="input-search-transactions"
            />
          </div>
          
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`flex items-center gap-2 px-4 py-3 border rounded-lg transition-colors ${
              showAdvancedFilters || activeFiltersCount > 0
                ? 'bg-accent-secondary border-accent text-content-primary'
                : 'bg-surface-elevated/50 border-edge-strong text-content-secondary hover:bg-surface-elevated'
            }`}
            data-testid="button-toggle-filters"
          >
            <Filter size={20} />
            {t('filtres')}
            {activeFiltersCount > 0 && (
              <span className="bg-white text-accent text-xs font-bold px-2 py-0.5 rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {showAdvancedFilters && (
          <div className="bg-surface-elevated/30 border border-edge-strong rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-content-primary font-medium">{t('filtresAvances')}</span>
              <button
                onClick={resetFilters}
                className="text-sm text-accent hover:text-accent flex items-center gap-1"
                data-testid="button-reset-filters"
              >
                <X size={16} />
                {t('reinitialiser')}
              </button>
            </div>

            <div className="grid md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-content-muted mb-1">{t('type')}</label>
                <select
                  value={filters.type}
                  onChange={(e) => updateFilter('type', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  data-testid="select-type-filter"
                >
                  <option value="all">{t('tous')}</option>
                  <option value="credit">{t('credit')}</option>
                  <option value="debit">{t('debit')}</option>
                  <option value="transfer">{t('virement')}</option>
                  <option value="fee">{t('frais')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-content-muted mb-1">{t('statut')}</label>
                <select
                  value={filters.status}
                  onChange={(e) => updateFilter('status', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  data-testid="select-status-filter"
                >
                  <option value="all">{t('tous')}</option>
                  <option value="completed">{t('complete')}</option>
                  <option value="pending">{t('enAttenteStatus')}</option>
                  <option value="failed">{t('echoue')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-content-muted mb-1">{t('categorie')}</label>
                <select
                  value={filters.category}
                  onChange={(e) => updateFilter('category', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  data-testid="select-category-filter"
                >
                  <option value="all">{t('toutes')}</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-content-muted mb-1">{t('trierPar')}</label>
                <div className="flex gap-2">
                  <select
                    value={filters.sortBy}
                    onChange={(e) => updateFilter('sortBy', e.target.value)}
                    className="flex-1 px-3 py-2 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-accent"
                    data-testid="select-sort-by"
                  >
                    <option value="date">{t('date')}</option>
                    <option value="amount">{t('montant')}</option>
                    <option value="type">{t('type')}</option>
                  </select>
                  <button
                    onClick={() => updateFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="px-3 py-2 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary hover:bg-surface-subtle transition-colors"
                    data-testid="button-toggle-sort-order"
                  >
                    <ArrowUpDown size={20} className={filters.sortOrder === 'asc' ? 'rotate-180' : ''} />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-content-muted mb-1 flex items-center gap-1">
                  <Calendar size={14} />
                  {t('dateDebut')}
                </label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => updateFilter('dateFrom', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  data-testid="input-date-from"
                />
              </div>

              <div>
                <label className="block text-sm text-content-muted mb-1 flex items-center gap-1">
                  <Calendar size={14} />
                  {t('dateFin')}
                </label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => updateFilter('dateTo', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  data-testid="input-date-to"
                />
              </div>

              <div>
                <label className="block text-sm text-content-muted mb-1">{t('montantMin')} (FCFA)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={filters.minAmount}
                  onChange={(e) => updateFilter('minAmount', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  data-testid="input-min-amount"
                />
              </div>

              <div>
                <label className="block text-sm text-content-muted mb-1">{t('montantMax')} (FCFA)</label>
                <input
                  type="number"
                  placeholder="∞"
                  value={filters.maxAmount}
                  onChange={(e) => updateFilter('maxAmount', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  data-testid="input-max-amount"
                />
              </div>
            </div>
          </div>
        )}

        <div className="text-sm text-content-muted">
          {filteredTransactions.length} {t('transactionsTrouvees')}
        </div>



        {/* Mobile / Tablet Card View */}
        <div className="md:hidden space-y-4">
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-8 text-content-muted">
               {t('aucuneTransaction')}
            </div>
          ) : (
            filteredTransactions.map((transaction) => (
              <div 
                key={transaction.id}
                className="bg-surface-elevated/30 border border-edge-strong rounded-lg p-4 space-y-3"
              >
                {/* Header: Date + Status */}
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs text-content-muted block">{formatDate(transaction.date)}</span>
                    <span className="text-content-primary font-medium">{transaction.description}</span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${getStatusColor(transaction.status)} bg-surface`}>
                       {ALL_STATUS_LABELS[transaction.status] || transaction.status}
                  </span>
                </div>

                {/* Amount + Reference */}
                <div className="flex justify-between items-center border-t border-edge-strong/50 pt-2">
                   <div className="flex flex-col">
                      <span className="text-[10px] text-content-muted uppercase">Référence</span>
                      <span className="text-xs text-accent font-mono">{transaction.reference}</span>
                   </div>
                   <div className={`text-lg font-bold ${
                      transaction.type === 'credit' ? 'text-status-success' : 
                      transaction.type === 'debit' ? 'text-status-danger' : 'text-content-primary'
                    }`}>
                      {transaction.type === 'credit' ? '+' : transaction.type === 'debit' ? '-' : ''}
                      {formatMoney(transaction.amount)}
                   </div>
                </div>
                
                {/* Footer: Type Badge */}
                <div className="flex justify-start">
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${getTypeColor(transaction.type)}`}>
                        {transaction.type}
                    </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-edge">
                <th className="text-left py-3 px-4 text-content-muted font-medium">{t('date')}</th>
                <th className="text-left py-3 px-4 text-content-muted font-medium">{t('reference')}</th>
                <th className="text-left py-3 px-4 text-content-muted font-medium">{t('type')}</th>
                <th className="text-left py-3 px-4 text-content-muted font-medium">{t('description')}</th>
                <th className="text-right py-3 px-4 text-content-muted font-medium">{t('montant')}</th>
                <th className="text-center py-3 px-4 text-content-muted font-medium">{t('statut')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-content-muted">
                    {t('aucuneTransaction')}
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((transaction) => (
                  <tr 
                    key={transaction.id} 
                    className="border-b border-edge-subtle hover:bg-surface-elevated/30 transition-colors"
                    data-testid={`row-transaction-${transaction.id}`}
                  >
                    <td className="py-3 px-4 text-content-primary">{formatDate(transaction.date)}</td>
                    <td className="py-3 px-4 text-content-secondary font-mono text-sm">{transaction.reference}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(transaction.type)}`}>
                        {transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-content-secondary">{transaction.description}</td>
                    <td className={`py-3 px-4 text-right font-semibold ${
                      transaction.type === 'credit' ? 'text-status-success' : 
                      transaction.type === 'debit' ? 'text-status-danger' : 'text-content-primary'
                    }`}>
                      {transaction.type === 'credit' ? '+' : transaction.type === 'debit' ? '-' : ''}
                      {formatMoney(transaction.amount)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-sm font-medium ${getStatusColor(transaction.status)}`}>
                        {transaction.status === 'completed' ? `✓ ${t('complete')}` :
                         transaction.status === 'pending' ? `⏳ ${t('enAttenteStatus')}` : `✗ ${t('echoue')}`}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
