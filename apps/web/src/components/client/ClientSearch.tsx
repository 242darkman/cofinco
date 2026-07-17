import React, { useState } from 'react';
import { Search, Filter, X, Calendar, DollarSign, MapPin } from 'lucide-react';
import { StatutClient, STATUT_CLIENT_LABELS, SegmentClient, SEGMENT_CLIENT_LABELS } from '@shared/enum/status-constants';

interface ClientSearchProps {
  onSearch: (filters: SearchFilters) => void;
  onClose: () => void;
}

export interface SearchFilters {
  searchTerm?: string;
  status?: string;
  segment?: string;
  creditMin?: number;
  creditMax?: number;
  dateFrom?: string;
  dateTo?: string;
  localisation?: string;
}

export default function ClientSearch({ onSearch, onClose }: ClientSearchProps) {
  const [filters, setFilters] = useState<SearchFilters>({
    searchTerm: '',
    status: 'all',
    segment: 'all',
    creditMin: 0,
    creditMax: 1000000,
    dateFrom: '',
    dateTo: '',
    localisation: ''
  });

  const handleSearch = () => {
    const activeFilters: SearchFilters = {};

    if (filters.searchTerm) activeFilters.searchTerm = filters.searchTerm;
    if (filters.status && filters.status !== 'all') activeFilters.status = filters.status;
    if (filters.segment && filters.segment !== 'all') activeFilters.segment = filters.segment;
    if (filters.creditMin && filters.creditMin > 0) activeFilters.creditMin = filters.creditMin;
    if (filters.creditMax && filters.creditMax < 1000000) activeFilters.creditMax = filters.creditMax;
    if (filters.dateFrom) activeFilters.dateFrom = filters.dateFrom;
    if (filters.dateTo) activeFilters.dateTo = filters.dateTo;
    if (filters.localisation) activeFilters.localisation = filters.localisation;

    onSearch(activeFilters);
  };

  const handleReset = () => {
    setFilters({
      searchTerm: '',
      status: 'all',
      segment: 'all',
      creditMin: 0,
      creditMax: 1000000,
      dateFrom: '',
      dateTo: '',
      localisation: ''
    });
    onSearch({});
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-surface-base to-surface border border-edge rounded-xl max-w-4xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-surface-base/95 backdrop-blur-sm border-b border-edge p-6 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h2 className="text-2xl font-bold text-content-primary flex items-center gap-3">
              <Filter className="text-accent" size={28} />
              Recherche Avancée
            </h2>
            <p className="text-content-muted text-sm mt-1">
              Filtrez les clients selon plusieurs critères
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-elevated rounded-lg transition text-content-muted hover:text-content-primary"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Colonne gauche */}
            <div className="space-y-6">
              <div className="bg-surface/50 border border-edge rounded-lg p-4">
                <label className="block text-sm font-semibold text-content-secondary mb-2 flex items-center gap-2">
                  <Search size={16} />
                  Recherche générale
                </label>
                <input
                  type="text"
                  value={filters.searchTerm}
                  onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                  className="w-full px-[14px] py-[10px] bg-input-bg border border-input-border rounded-lg text-input-text text-[13px] placeholder:text-input-placeholder transition-all duration-200 focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/30 hover:border-content-muted shadow-sm"
                  placeholder="Nom complet, prénom, email, téléphone..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface/50 border border-edge rounded-lg p-4">
                  <label className="block text-sm font-semibold text-content-secondary mb-2">Statut</label>
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-[14px] py-[10px] bg-input-bg border border-input-border rounded-lg text-input-text text-[13px] placeholder:text-input-placeholder transition-all duration-200 focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/30 hover:border-content-muted shadow-sm"
                  >
                    <option value="all">Tous les statuts</option>
                    <option value={StatutClient.ACTIVE}>{STATUT_CLIENT_LABELS[StatutClient.ACTIVE]}</option>
                    <option value={StatutClient.SUSPENDED}>{STATUT_CLIENT_LABELS[StatutClient.SUSPENDED]}</option>
                    <option value={StatutClient.INACTIVE}>{STATUT_CLIENT_LABELS[StatutClient.INACTIVE]}</option>
                  </select>
                </div>

                <div className="bg-surface/50 border border-edge rounded-lg p-4">
                  <label className="block text-sm font-semibold text-content-secondary mb-2">Segment</label>
                  <select
                    value={filters.segment}
                    onChange={(e) => setFilters(prev => ({ ...prev, segment: e.target.value }))}
                    className="w-full px-[14px] py-[10px] bg-input-bg border border-input-border rounded-lg text-input-text text-[13px] placeholder:text-input-placeholder transition-all duration-200 focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/30 hover:border-content-muted shadow-sm"
                  >
                    <option value="all">Tous les segments</option>
                    <option value={SegmentClient.VIP}>{SEGMENT_CLIENT_LABELS[SegmentClient.VIP]}</option>
                    <option value={SegmentClient.PREMIUM}>{SEGMENT_CLIENT_LABELS[SegmentClient.PREMIUM]}</option>
                    <option value={SegmentClient.STANDARD}>{SEGMENT_CLIENT_LABELS[SegmentClient.STANDARD]}</option>
                    <option value={SegmentClient.RISQUE}>{SEGMENT_CLIENT_LABELS[SegmentClient.RISQUE]}</option>
                  </select>
                </div>
              </div>

              <div className="bg-surface/50 border border-edge rounded-lg p-4">
                <label className="block text-sm font-semibold text-content-secondary mb-2 flex items-center gap-2">
                  <MapPin size={16} />
                  Localisation
                </label>
                <input
                  type="text"
                  value={filters.localisation}
                  onChange={(e) => setFilters(prev => ({ ...prev, localisation: e.target.value }))}
                  className="w-full px-[14px] py-[10px] bg-input-bg border border-input-border rounded-lg text-input-text text-[13px] placeholder:text-input-placeholder transition-all duration-200 focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/30 hover:border-content-muted shadow-sm"
                  placeholder="Brazzaville, Poto-Poto, etc..."
                />
              </div>
            </div>

            {/* Colonne droite */}
            <div className="space-y-6">
              <div className="bg-surface/50 border border-edge rounded-lg p-4">
                <label className="block text-sm font-semibold text-content-secondary mb-3 flex items-center gap-2">
                  <DollarSign size={16} />
                  Montant Crédit Total
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-content-muted mb-1">Minimum (FC)</label>
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={filters.creditMin}
                      onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setFilters(prev => ({ ...prev, creditMin: v ? Number(v) : 0 })); }}
                      className="w-full px-[14px] py-[10px] bg-input-bg border border-input-border rounded-lg text-input-text text-[13px] placeholder:text-input-placeholder transition-all duration-200 focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/30 hover:border-content-muted shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-content-muted mb-1">Maximum (FC)</label>
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={filters.creditMax}
                      onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setFilters(prev => ({ ...prev, creditMax: v ? Number(v) : 0 })); }}
                      className="w-full px-[14px] py-[10px] bg-input-bg border border-input-border rounded-lg text-input-text text-[13px] placeholder:text-input-placeholder transition-all duration-200 focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/30 hover:border-content-muted shadow-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-surface/50 border border-edge rounded-lg p-4">
                <label className="block text-sm font-semibold text-content-secondary mb-3 flex items-center gap-2">
                  <Calendar size={16} />
                  Période d'inscription
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-content-muted mb-1">Date début</label>
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                      className="w-full px-[14px] py-[10px] bg-input-bg border border-input-border rounded-lg text-input-text text-[13px] placeholder:text-input-placeholder transition-all duration-200 focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/30 hover:border-content-muted shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-content-muted mb-1">Date fin</label>
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                      className="w-full bg-surface-elevated text-content-primary px-4 py-2 rounded-lg border border-edge-strong focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6 pt-4 border-t border-edge">
            <button
              onClick={handleReset}
              className="flex-1 px-6 py-3 bg-surface-elevated hover:bg-surface-subtle text-content-primary font-semibold rounded-lg transition"
            >
              Réinitialiser
            </button>
            <button
              onClick={handleSearch}
              className="flex-1 px-6 py-3 bg-accent hover:bg-accent-primary-hover text-white font-semibold rounded-lg transition flex items-center justify-center gap-2 shadow-lg shadow-accent/30 hover:shadow-xl hover:shadow-accent/40"
            >
              <Search size={20} />
              Rechercher
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
