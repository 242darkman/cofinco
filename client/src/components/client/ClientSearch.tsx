import type { Client } from '@shared/schema';
import React, { useState } from 'react';
import { Search, Filter, X, Calendar, DollarSign, Award, MapPin } from 'lucide-react';

interface ClientSearchProps {
  onSearch: (filters: SearchFilters) => void;
  onClose: () => void;
}

export interface SearchFilters {
  searchTerm?: string;
  status?: string;
  segment?: string;
  scoreMin?: number;
  scoreMax?: number;
  creditMin?: number;
  creditMax?: number;
  dateFrom?: string;
  dateTo?: string;
  ville?: string;
}

export default function ClientSearch({ onSearch, onClose }: ClientSearchProps) {
  const [filters, setFilters] = useState<SearchFilters>({
    searchTerm: '',
    status: 'all',
    segment: 'all',
    scoreMin: 0,
    scoreMax: 100,
    creditMin: 0,
    creditMax: 1000000,
    dateFrom: '',
    dateTo: '',
    ville: ''
  });

  const handleSearch = () => {
    const activeFilters: SearchFilters = {};

    if (filters.searchTerm) activeFilters.searchTerm = filters.searchTerm;
    if (filters.status && filters.status !== 'all') activeFilters.status = filters.status;
    if (filters.segment && filters.segment !== 'all') activeFilters.segment = filters.segment;
    if (filters.scoreMin && filters.scoreMin > 0) activeFilters.scoreMin = filters.scoreMin;
    if (filters.scoreMax && filters.scoreMax < 100) activeFilters.scoreMax = filters.scoreMax;
    if (filters.creditMin && filters.creditMin > 0) activeFilters.creditMin = filters.creditMin;
    if (filters.creditMax && filters.creditMax < 1000000) activeFilters.creditMax = filters.creditMax;
    if (filters.dateFrom) activeFilters.dateFrom = filters.dateFrom;
    if (filters.dateTo) activeFilters.dateTo = filters.dateTo;
    if (filters.ville) activeFilters.ville = filters.ville;

    onSearch(activeFilters);
  };

  const handleReset = () => {
    setFilters({
      searchTerm: '',
      status: 'all',
      segment: 'all',
      scoreMin: 0,
      scoreMax: 100,
      creditMin: 0,
      creditMax: 1000000,
      dateFrom: '',
      dateTo: '',
      ville: ''
    });
    onSearch({});
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl max-w-4xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 p-6 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Filter className="text-cyan-400" size={28} />
              Recherche Avancée
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Filtrez les clients selon plusieurs critères
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition text-slate-400 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <label className="block text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
              <Search size={16} />
              Recherche générale
            </label>
            <input
              type="text"
              value={filters.searchTerm}
              onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
              className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="Nom, email, téléphone..."
            />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <label className="block text-sm font-semibold text-slate-300 mb-2">Statut</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="all">Tous les statuts</option>
                <option value="Actif">Actif</option>
                <option value="Suspendu">Suspendu</option>
                <option value="Inactif">Inactif</option>
              </select>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <label className="block text-sm font-semibold text-slate-300 mb-2">Segment</label>
              <select
                value={filters.segment}
                onChange={(e) => setFilters(prev => ({ ...prev, segment: e.target.value }))}
                className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="all">Tous les segments</option>
                <option value="VIP">VIP</option>
                <option value="Standard">Standard</option>
                <option value="Nouveau">Nouveau</option>
              </select>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <label className="block text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Award size={16} />
              Plage de Score
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Minimum</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={filters.scoreMin}
                  onChange={(e) => setFilters(prev => ({ ...prev, scoreMin: Number(e.target.value) }))}
                  className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Maximum</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={filters.scoreMax}
                  onChange={(e) => setFilters(prev => ({ ...prev, scoreMax: Number(e.target.value) }))}
                  className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>Score: {filters.scoreMin}</span>
              <span>à</span>
              <span>{filters.scoreMax}</span>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <label className="block text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <DollarSign size={16} />
              Montant Crédit Total
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Minimum (FC)</label>
                <input
                  type="number"
                  min="0"
                  value={filters.creditMin}
                  onChange={(e) => setFilters(prev => ({ ...prev, creditMin: Number(e.target.value) }))}
                  className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Maximum (FC)</label>
                <input
                  type="number"
                  min="0"
                  value={filters.creditMax}
                  onChange={(e) => setFilters(prev => ({ ...prev, creditMax: Number(e.target.value) }))}
                  className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <label className="block text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Calendar size={16} />
              Période d'inscription
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Date début</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Date fin</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <label className="block text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
              <MapPin size={16} />
              Localisation
            </label>
            <input
              type="text"
              value={filters.ville}
              onChange={(e) => setFilters(prev => ({ ...prev, ville: e.target.value }))}
              className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="Brazzaville, Poto-Poto, etc..."
            />
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-700">
            <button
              onClick={handleReset}
              className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition"
            >
              Réinitialiser
            </button>
            <button
              onClick={handleSearch}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
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
