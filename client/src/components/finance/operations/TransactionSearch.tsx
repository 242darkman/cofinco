import React, { useState, useMemo } from 'react';
import { Search, Filter, Calendar, ArrowUpDown, X, Download } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

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
        `${t.date},${t.reference || ''},${t.type},${t.category},"${t.description}",${t.amount},${t.status}`
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
      case 'credit': return 'text-emerald-400 bg-emerald-400/10';
      case 'debit': return 'text-red-400 bg-red-400/10';
      case 'transfer': return 'text-cyan-400 bg-cyan-400/10';
      case 'fee': return 'text-amber-400 bg-amber-400/10';
      default: return 'text-slate-400 bg-slate-400/10';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-emerald-400';
      case 'pending': return 'text-amber-400';
      case 'failed': return 'text-red-400';
      default: return 'text-slate-400';
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
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-white flex items-center gap-2">
          <Search className="text-cyan-400" size={24} />
          {t('rechercheTransactions')}
        </h3>
        <div className="flex items-center gap-3">
          {exportMessage && (
            <span className="text-emerald-400 text-sm">{exportMessage}</span>
          )}
          <button
            onClick={() => handleExport(filteredTransactions)}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder={t('rechercherParDescription')}
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              data-testid="input-search-transactions"
            />
          </div>
          
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`flex items-center gap-2 px-4 py-3 border rounded-lg transition-colors ${
              showAdvancedFilters || activeFiltersCount > 0
                ? 'bg-cyan-600 border-cyan-600 text-white'
                : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700'
            }`}
            data-testid="button-toggle-filters"
          >
            <Filter size={20} />
            {t('filtres')}
            {activeFiltersCount > 0 && (
              <span className="bg-white text-cyan-600 text-xs font-bold px-2 py-0.5 rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {showAdvancedFilters && (
          <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-white font-medium">{t('filtresAvances')}</span>
              <button
                onClick={resetFilters}
                className="text-sm text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                data-testid="button-reset-filters"
              >
                <X size={16} />
                {t('reinitialiser')}
              </button>
            </div>

            <div className="grid md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">{t('type')}</label>
                <select
                  value={filters.type}
                  onChange={(e) => updateFilter('type', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
                <label className="block text-sm text-slate-400 mb-1">{t('statut')}</label>
                <select
                  value={filters.status}
                  onChange={(e) => updateFilter('status', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  data-testid="select-status-filter"
                >
                  <option value="all">{t('tous')}</option>
                  <option value="completed">{t('complete')}</option>
                  <option value="pending">{t('enAttenteStatus')}</option>
                  <option value="failed">{t('echoue')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">{t('categorie')}</label>
                <select
                  value={filters.category}
                  onChange={(e) => updateFilter('category', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  data-testid="select-category-filter"
                >
                  <option value="all">{t('toutes')}</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">{t('trierPar')}</label>
                <div className="flex gap-2">
                  <select
                    value={filters.sortBy}
                    onChange={(e) => updateFilter('sortBy', e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    data-testid="select-sort-by"
                  >
                    <option value="date">{t('date')}</option>
                    <option value="amount">{t('montant')}</option>
                    <option value="type">{t('type')}</option>
                  </select>
                  <button
                    onClick={() => updateFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white hover:bg-slate-600 transition-colors"
                    data-testid="button-toggle-sort-order"
                  >
                    <ArrowUpDown size={20} className={filters.sortOrder === 'asc' ? 'rotate-180' : ''} />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1 flex items-center gap-1">
                  <Calendar size={14} />
                  {t('dateDebut')}
                </label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => updateFilter('dateFrom', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  data-testid="input-date-from"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1 flex items-center gap-1">
                  <Calendar size={14} />
                  {t('dateFin')}
                </label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => updateFilter('dateTo', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  data-testid="input-date-to"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">{t('montantMin')} (FCFA)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={filters.minAmount}
                  onChange={(e) => updateFilter('minAmount', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  data-testid="input-min-amount"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">{t('montantMax')} (FCFA)</label>
                <input
                  type="number"
                  placeholder="∞"
                  value={filters.maxAmount}
                  onChange={(e) => updateFilter('maxAmount', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  data-testid="input-max-amount"
                />
              </div>
            </div>
          </div>
        )}

        <div className="text-sm text-slate-400">
          {filteredTransactions.length} {t('transactionsTrouvees')}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-4 text-slate-400 font-medium">{t('date')}</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">{t('reference')}</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">{t('type')}</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">{t('description')}</th>
                <th className="text-right py-3 px-4 text-slate-400 font-medium">{t('montant')}</th>
                <th className="text-center py-3 px-4 text-slate-400 font-medium">{t('statut')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    {t('aucuneTransaction')}
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((transaction) => (
                  <tr 
                    key={transaction.id} 
                    className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                    data-testid={`row-transaction-${transaction.id}`}
                  >
                    <td className="py-3 px-4 text-white">{formatDate(transaction.date)}</td>
                    <td className="py-3 px-4 text-slate-300 font-mono text-sm">{transaction.reference}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(transaction.type)}`}>
                        {transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300">{transaction.description}</td>
                    <td className={`py-3 px-4 text-right font-semibold ${
                      transaction.type === 'credit' ? 'text-emerald-400' : 
                      transaction.type === 'debit' ? 'text-red-400' : 'text-white'
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
