import React, { useState, useEffect, useCallback } from 'react';
import { X, Filter } from 'lucide-react';
import { SearchInput } from '../ui';
import { StatutClient, STATUT_CLIENT_LABELS } from '@shared/enum/status-constants';

export interface ClientFiltersState {
  searchTerm: string;
  status: string;
  segment: string;
}

interface ClientFiltersProps {
  onFilterChange: (filters: ClientFiltersState) => void;
  initialFilters?: Partial<ClientFiltersState>;
  className?: string;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Statut' },
  { value: StatutClient.ACTIVE, label: STATUT_CLIENT_LABELS.ACTIVE },
  { value: StatutClient.INACTIVE, label: STATUT_CLIENT_LABELS.INACTIVE },
  { value: StatutClient.SUSPENDED, label: STATUT_CLIENT_LABELS.SUSPENDED },
  { value: StatutClient.DELETED, label: STATUT_CLIENT_LABELS.DELETED },
];

const SEGMENT_OPTIONS = [
  { value: 'all', label: 'Segment' },
  { value: 'STANDARD', label: 'Standard' },
  { value: 'PREMIUM', label: 'Premium' },
  { value: 'VIP', label: 'VIP' },
  { value: 'RISQUE', label: 'Risqué' },
];

export default function ClientFilters({ onFilterChange, initialFilters, className = '' }: ClientFiltersProps) {
  const [filters, setFilters] = useState<ClientFiltersState>({
    searchTerm: '',
    status: 'all',
    segment: 'all',
    ...initialFilters
  });

  const [debouncedSearch, setDebouncedSearch] = useState(filters.searchTerm);

  // P5.7: Memoized handlers to prevent unnecessary re-renders
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, searchTerm: e.target.value }));
  }, []);

  const handleSearchClear = useCallback(() => {
    setFilters(prev => ({ ...prev, searchTerm: '' }));
  }, []);

  const handleStatusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, status: e.target.value }));
  }, []);

  const handleSegmentChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, segment: e.target.value }));
  }, []);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters.searchTerm]);

  // Notify parent of changes
  useEffect(() => {
    onFilterChange({
      ...filters,
      searchTerm: debouncedSearch
    });
  }, [filters.status, filters.segment, debouncedSearch]);

  const clearFilters = () => {
    setFilters({ searchTerm: '', status: 'all', segment: 'all' });
  };

  const hasActiveFilters = filters.status !== 'all' || filters.segment !== 'all';
  const activeCount = (filters.status !== 'all' ? 1 : 0) + (filters.segment !== 'all' ? 1 : 0);

  return (
    <div className={`flex items-center gap-1.5 w-full ${className}`}>
      {/* Search */}
      <div className="flex-1 min-w-0">
        <SearchInput
          value={filters.searchTerm}
          onChange={handleSearchChange}
          onClear={handleSearchClear}
          placeholder="Rechercher un client..."
          className="w-full"
        />
      </div>

      {/* Status filter */}
      <select
        value={filters.status}
        onChange={handleStatusChange}
        className={`h-10 sm:h-11 text-xs sm:text-sm font-medium rounded-lg border px-3 pr-7 appearance-none bg-no-repeat bg-[length:14px] bg-[right_8px_center] cursor-pointer transition-colors outline-none focus:ring-2 focus:ring-blue-500/30 ${
          filters.status !== 'all'
            ? 'bg-blue-500/10 border-blue-500/40 text-blue-400'
            : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
        }`}
        style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")` }}
      >
        {STATUS_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.value === 'all' ? 'Tous les statuts' : opt.label}</option>
        ))}
      </select>

      {/* Segment filter */}
      <select
        value={filters.segment}
        onChange={handleSegmentChange}
        className={`h-10 sm:h-11 text-xs sm:text-sm font-medium rounded-lg border px-3 pr-7 appearance-none bg-no-repeat bg-[length:14px] bg-[right_8px_center] cursor-pointer transition-colors outline-none focus:ring-2 focus:ring-blue-500/30 ${
          filters.segment !== 'all'
            ? 'bg-blue-500/10 border-blue-500/40 text-blue-400'
            : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
        }`}
        style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")` }}
      >
        {SEGMENT_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.value === 'all' ? 'Tous les segments' : opt.label}</option>
        ))}
      </select>

      {/* Active filter indicator + clear */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="h-10 sm:h-11 px-2.5 flex items-center gap-1 text-xs sm:text-sm font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg transition-colors shrink-0"
          title="Effacer les filtres"
        >
          <X size={12} />
          <span>{activeCount}</span>
        </button>
      )}
    </div>
  );
}
