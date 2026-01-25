import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { SearchInput, Button, SelectField } from '../ui';
import { StatutClient, STATUT_CLIENT_LABELS } from '@shared/enum/status-constants';

export interface ClientFiltersState {
  searchTerm: string;
  statut: string;
  segment: string;
}

interface ClientFiltersProps {
  onFilterChange: (filters: ClientFiltersState) => void;
  initialFilters?: ClientFiltersState;
  className?: string;
}

export default function ClientFilters({ onFilterChange, initialFilters, className = '' }: ClientFiltersProps) {
  const [filters, setFilters] = useState<ClientFiltersState>({
    searchTerm: '',
    statut: 'all',
    segment: 'all',
    ...initialFilters
  });

  const [debouncedSearch, setDebouncedSearch] = useState(filters.searchTerm);

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
  }, [filters.statut, filters.segment, debouncedSearch]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, searchTerm: e.target.value }));
  };

  // Handler for clear button in SearchInput
  const handleSearchClear = () => {
    setFilters(prev => ({ ...prev, searchTerm: '' }));
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, statut: e.target.value }));
  };

  const handleSegmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, segment: e.target.value }));
  };

  const clearFilters = () => {
    setFilters({
      searchTerm: '',
      statut: 'all',
      segment: 'all'
    });
  };

  const hasActiveFilters = filters.statut !== 'all' || filters.segment !== 'all';

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-2 w-full">
        {/* Search Input - Flexible */}
        <div className="flex-1 min-w-[200px]">
          <SearchInput
            value={filters.searchTerm}
            onChange={handleSearchChange}
            onClear={handleSearchClear}
            placeholder="Rechercher un client..."
            className="w-full h-8 text-xs"
          />
        </div>

        {/* Status Filter - Fixed Width */}
        <div className="w-[140px]">
          <SelectField
            label=""
            name="statut"
            value={filters.statut}
            onChange={handleStatusChange}
            options={[
              { value: 'all', label: 'Tous les statuts' },
              { value: StatutClient.ACTIVE, label: STATUT_CLIENT_LABELS.ACTIVE },
              { value: StatutClient.SUSPENDED, label: STATUT_CLIENT_LABELS.SUSPENDED },
              { value: StatutClient.INACTIVE, label: STATUT_CLIENT_LABELS.INACTIVE }
            ]}
            className="mb-0 [&>select]:h-8 [&>select]:text-xs [&>select]:py-0"
            containerClassName="!mb-0"
            placeholder={undefined} // Remove placeholder option for clearer selection
          />
        </div>

        {/* Segment Filter - Fixed Width */}
        <div className="w-[140px]">
          <SelectField
            label=""
            name="segment"
            value={filters.segment}
            onChange={handleSegmentChange}
            options={[
              { value: 'all', label: 'Tous les segments' },
              { value: 'VIP', label: 'VIP' },
              { value: 'Premium', label: 'Premium' },
              { value: 'Standard', label: 'Standard' }
            ]}
            className="mb-0 [&>select]:h-8 [&>select]:text-xs [&>select]:py-0"
            containerClassName="!mb-0"
            placeholder={undefined}
          />
        </div>

        {/* Clear Button */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            icon={X}
            onClick={clearFilters}
            className="text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 h-8 w-8 p-0 flex items-center justify-center shrink-0"
            title="Effacer les filtres"
          />
        )}
      </div>
    </div>
  );
}
