import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { SearchInput, Button, SelectField } from '../ui';
import { StatutClient } from '@shared/enum/status-constants';
import { CLIENT_STATUS_LABELS } from '@/lib/status-labels';

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
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        {/* Search Input - Spans more columns on desktop */}
        <div className="md:col-span-5 lg:col-span-6">
          <label className="block text-xs font-medium text-slate-500 mb-1.5 ml-1">Recherche</label>
          <SearchInput
            value={filters.searchTerm}
            onChange={handleSearchChange}
            onClear={handleSearchClear}
            placeholder="Nom complet, email, téléphone..."
            className="w-full"
          />
        </div>

        {/* Status Filter */}
        <div className="md:col-span-3 lg:col-span-2">
            <SelectField
              label="Statut"
              name="statut"
              value={filters.statut}
              onChange={handleStatusChange}
              options={[
                { value: 'all', label: 'Tous les statuts' },
                { value: StatutClient.ACTIVE, label: CLIENT_STATUS_LABELS.ACTIVE },
                { value: StatutClient.SUSPENDED, label: CLIENT_STATUS_LABELS.SUSPENDED },
                { value: StatutClient.INACTIVE, label: CLIENT_STATUS_LABELS.INACTIVE }
              ]}
              className="mb-0"
            />
        </div>

        {/* Segment Filter */}
        <div className="md:col-span-3 lg:col-span-3">
            <SelectField
              label="Segment"
              name="segment"
              value={filters.segment}
              onChange={handleSegmentChange}
              options={[
                { value: 'all', label: 'Tous les segments' },
                { value: 'VIP', label: 'VIP' },
                { value: 'Premium', label: 'Premium' },
                { value: 'Standard', label: 'Standard' }
              ]}
              className="mb-0"
            />
        </div>

        {/* Clear Button - Fixed width, aligned with inputs */}
        <div className="md:col-span-1 flex justify-center md:justify-start">
           {hasActiveFilters && (
             <Button
              variant="ghost"
              size="md" // Match input height
              icon={X}
              onClick={clearFilters}
              className="text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 w-full md:w-auto justify-center"
              title="Effacer"
            />
           )}
        </div>
      </div>
    </div>
  );
}
