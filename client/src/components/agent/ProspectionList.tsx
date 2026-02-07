import React, { useState, useEffect, useCallback } from 'react';
import { Search, Filter, UserPlus, Eye, ArrowRightLeft, Download, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { prospectionApi, arrondissementApi } from '../../lib/api-client';
import { STATUT_PROSPECTION_LABELS, STATUT_PROSPECTION_OPTIONS } from '@shared/enum/status-constants';
import type { StatutProspectionType } from '@shared/enum/status-constants';
import { usePermissions } from '../auth/ProtectedFeature';
import ProspectDetailModal from './ProspectDetailModal';

interface ProspectionListProps {
  agentId?: string;
  onCreateNew?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  REGISTERED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  INTERESTED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  REFUSED: 'bg-red-500/20 text-red-400 border-red-500/30',
  TO_FOLLOW_UP: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  CONVERTED_TO_CLIENT: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

export default function ProspectionList({ agentId, onCreateNew }: ProspectionListProps) {
  const { hasPermission } = usePermissions();
  const canConvert = hasPermission('prospection', 'convert');
  const canExport = hasPermission('prospection', 'export');

  const [prospects, setProspects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterArrondissement, setFilterArrondissement] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Reference data
  const [arrondissements, setArrondissements] = useState<any[]>([]);

  // Detail modal
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  
  const ITEMS_PER_PAGE = 5;

  useEffect(() => {
    arrondissementApi.getAll({ actif: true }).then(setArrondissements).catch(() => {});
  }, []);

  const loadProspects = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, perPage: ITEMS_PER_PAGE };
      if (agentId) params.agentId = agentId;
      if (filterStatut) params.statut = filterStatut;
      if (filterArrondissement) params.arrondissementId = filterArrondissement;

      const result = await prospectionApi.getAll(params);
      setProspects(result.data || []);
      setTotalPages(result.meta?.pagination?.totalPages || 1);
      setTotal(result.meta?.pagination?.totalItems || 0);
    } catch (error) {
      console.error('Error loading prospections:', error);
    } finally {
      setLoading(false);
    }
  }, [page, agentId, filterStatut, filterArrondissement]);

  useEffect(() => {
    loadProspects();
  }, [loadProspects]);

  const getStatusBadge = (statut: string) => {
    const colorClass = STATUS_COLORS[statut] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    const label = STATUT_PROSPECTION_LABELS[statut as StatutProspectionType] || statut;
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border ${colorClass} uppercase tracking-wide`}>
        {label}
      </span>
    );
  };

  // Filter prospects by search term locally
  const filteredProspects = prospects.filter(p => {
    if (!search) return true;
    const term = search.toLowerCase();
    const nom = (p.nom_prospect || p.nomProspect || '').toLowerCase();
    const tel = (p.telephone_prospect || p.telephoneProspect || '').toLowerCase();
    return nom.includes(term) || tel.includes(term);
  });

  return (
    <div className="space-y-3">
      {/* Header Compact */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            Prospects
            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-normal text-slate-400 border border-slate-700">{total}</span>
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={loadProspects}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            title="Rafraîchir"
          >
            <RefreshCw size={14} />
          </button>
          {onCreateNew && (
            <button
              onClick={onCreateNew}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-bold uppercase tracking-wide transition shadow-sm hover:shadow"
            >
              <UserPlus size={12} />
              Nouveau
            </button>
          )}
        </div>
      </div>

      {/* Search & Filters Compact */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-xs text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:bg-slate-800 focus:outline-none transition-all"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`p-1.5 rounded-lg border transition ${showFilters ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white'}`}
        >
          <Filter size={14} />
        </button>
      </div>

      {/* Filter Panel Compact */}
      {showFilters && (
        <div className="grid grid-cols-2 gap-2 p-2 bg-slate-800/50 rounded-lg border border-slate-700/50 animate-in slide-in-from-top-2 duration-200">
          <div>
            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Statut</label>
            <select
              value={filterStatut}
              onChange={(e) => { setFilterStatut(e.target.value); setPage(1); }}
              className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="">Tous</option>
              {STATUT_PROSPECTION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Arrondissement</label>
            <select
              value={filterArrondissement}
              onChange={(e) => { setFilterArrondissement(e.target.value); setPage(1); }}
              className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="">Tous</option>
              {arrondissements.map((a: any) => (
                <option key={a.id} value={a.id}>{a.nom}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* List Compact */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-cyan-500" />
        </div>
      ) : filteredProspects.length === 0 ? (
        <div className="text-center py-8 bg-slate-800/30 rounded-lg border border-slate-800 border-dashed">
            <p className="text-xs text-slate-500">Aucun prospect trouvé</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredProspects.map((prospect: any) => (
            <div
              key={prospect.id}
              onClick={() => setSelectedProspectId(prospect.id)}
              className="p-2.5 bg-slate-800/40 border border-slate-700/30 rounded-lg hover:bg-slate-800 hover:border-slate-600 cursor-pointer transition-all group"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-slate-200 truncate group-hover:text-white transition-colors">
                      {prospect.nom_prospect || prospect.nomProspect}
                    </span>
                    {getStatusBadge(prospect.statut)}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span className="font-mono">{prospect.telephoneProspect}</span>
                    {(prospect.arrondissementNom || prospect.marcheNom) && (
                        <>
                            <span className="w-0.5 h-0.5 rounded-full bg-slate-600" />
                            <span className="truncate max-w-[150px]">
                                {[prospect.arrondissementNom, prospect.marcheNom].filter(Boolean).join(' - ')}
                            </span>
                        </>
                    )}
                  </div>
                </div>
                <Eye size={14} className="text-slate-600 group-hover:text-cyan-400 transition-colors flex-shrink-0" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Compact */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between py-1 border-t border-slate-800/50">
          <span className="text-[10px] text-slate-500">Page {page} / {totalPages}</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedProspectId && (
        <ProspectDetailModal
          prospectId={selectedProspectId}
          onClose={() => setSelectedProspectId(null)}
          onUpdate={loadProspects}
          canConvert={canConvert}
        />
      )}
    </div>
  );
}
