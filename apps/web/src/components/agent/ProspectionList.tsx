import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Search, Filter, UserPlus, Eye, ChevronLeft, ChevronRight, RefreshCw, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { prospectionApi, arrondissementApi } from '../../lib/api-client';
import { STATUT_PROSPECTION_LABELS, STATUT_PROSPECTION_OPTIONS } from '@shared/enum/status-constants';
import type { StatutProspectionType } from '@shared/enum/status-constants';
import { usePermissions } from '../auth/ProtectedFeature';
import { formatPhoneNumber } from '../../lib/format';
import ProspectDetailModal from './ProspectDetailModal';

interface ProspectionListProps {
  agentId?: string;
  onCreateNew?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  REGISTERED: 'bg-status-info-bg text-status-info border-status-info/30',
  INTERESTED: 'bg-status-success-bg text-status-success border-status-success/30',
  REFUSED: 'bg-status-danger-bg text-status-danger border-status-danger/30',
  TO_FOLLOW_UP: 'bg-status-warning-bg text-status-warning border-status-warning/30',
  CONVERTED_TO_CLIENT: 'bg-status-info-bg text-status-info border-status-info/30',
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];

export default function ProspectionList({ agentId, onCreateNew }: ProspectionListProps) {
  const { hasPermission } = usePermissions();
  const canConvert = hasPermission('prospection', 'convert');

  const [prospects, setProspects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Search (debounced, server-side)
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Filters
  const [filterStatut, setFilterStatut] = useState('');
  const [filterArrondissement, setFilterArrondissement] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Reference data
  const [arrondissements, setArrondissements] = useState<any[]>([]);

  // Detail modal
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  useEffect(() => {
    arrondissementApi.getAll({ actif: true }).then(setArrondissements).catch(() => {});
  }, []);

  const loadProspects = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, perPage };
      if (agentId) params.agentId = agentId;
      if (filterStatut) params.statut = filterStatut;
      if (filterArrondissement) params.arrondissementId = filterArrondissement;
      if (debouncedSearch) params.search = debouncedSearch;

      const result = await prospectionApi.getAll(params);
      setProspects(result.data || []);
      setTotalPages(result.meta?.pagination?.totalPages || 1);
      setTotal(result.meta?.pagination?.totalItems || 0);
    } catch {
      // Non-blocking: prospect list will show empty
    } finally {
      setLoading(false);
    }
  }, [page, perPage, agentId, filterStatut, filterArrondissement, debouncedSearch]);

  useEffect(() => {
    loadProspects();
  }, [loadProspects]);

  const getStatusBadge = (statut: string) => {
    const colorClass = STATUS_COLORS[statut] || 'bg-surface-subtle/40 text-content-muted border-edge-strong/30';
    const label = STATUT_PROSPECTION_LABELS[statut as StatutProspectionType] || statut;
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border ${colorClass} uppercase tracking-wide`}>
        {label}
      </span>
    );
  };

  // Compute visible page numbers
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | 'ellipsis')[] = [1];
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    if (start > 2) pages.push('ellipsis');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push('ellipsis');
    pages.push(totalPages);
    return pages;
  };

  const rangeStart = Math.min((page - 1) * perPage + 1, total);
  const rangeEnd = Math.min(page * perPage, total);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
            Prospects
            <span className="px-1.5 py-0.5 rounded bg-surface text-[10px] font-normal text-content-muted border border-edge">{total}</span>
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={loadProspects}
            className="p-1.5 text-content-muted hover:text-content-primary hover:bg-surface rounded-lg transition"
            aria-label="Rafraîchir la liste"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          {onCreateNew && (
            <button
              onClick={onCreateNew}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-accent hover:bg-accent text-white rounded-lg text-xs font-bold uppercase tracking-wide transition shadow-sm hover:shadow"
            >
              <UserPlus size={12} />
              <span className="hidden sm:inline">Nouveau</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, prénom ou téléphone..."
            className="w-full pl-8 pr-3 py-1.5 bg-surface/50 border border-edge-subtle rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:border-accent/50 focus:bg-surface focus:outline-none transition-all"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          aria-label="Afficher les filtres"
          className={`p-1.5 rounded-lg border transition ${showFilters ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-surface/50 border-edge-subtle text-content-muted hover:text-content-primary'}`}
        >
          <Filter size={14} />
        </button>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="grid grid-cols-2 gap-2 p-2 bg-surface/50 rounded-lg border border-edge-subtle animate-in slide-in-from-top-2 duration-200">
          <div>
            <label className="block text-[9px] font-bold text-content-muted uppercase mb-1">Statut</label>
            <select
              value={filterStatut}
              onChange={(e) => { setFilterStatut(e.target.value); setPage(1); }}
              className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded text-xs text-content-primary focus:border-accent focus:outline-none"
            >
              <option value="">Tous</option>
              {STATUT_PROSPECTION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-bold text-content-muted uppercase mb-1">Arrondissement</label>
            <select
              value={filterArrondissement}
              onChange={(e) => { setFilterArrondissement(e.target.value); setPage(1); }}
              className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded text-xs text-content-primary focus:border-accent focus:outline-none"
            >
              <option value="">Tous</option>
              {arrondissements.map((a: any) => (
                <option key={a.id} value={a.id}>{a.nom}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="sm" tone="accent" />
        </div>
      ) : prospects.length === 0 ? (
        <div className="text-center py-8 bg-surface/30 rounded-lg border border-edge border-dashed">
            <p className="text-xs text-content-muted">
              {debouncedSearch ? `Aucun résultat pour "${debouncedSearch}"` : 'Aucun prospect trouvé'}
            </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {prospects.map((prospect: any) => (
            <div
              key={prospect.id}
              onClick={() => setSelectedProspectId(prospect.id)}
              className="p-2.5 bg-surface/40 border border-edge-subtle rounded-lg hover:bg-surface hover:border-edge-strong cursor-pointer transition-all group"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-content-secondary truncate group-hover:text-content-primary transition-colors">
                      {[prospect.nom_prospect || prospect.nomProspect, prospect.prenom_prospect || prospect.prenomProspect].filter(Boolean).join(' ')}
                    </span>
                    {getStatusBadge(prospect.statut)}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-content-muted">
                    <span className="font-mono">{formatPhoneNumber(prospect.telephoneProspect)}</span>
                    {(prospect.arrondissementNom || prospect.marcheNom) && (
                        <>
                            <span className="w-0.5 h-0.5 rounded-full bg-surface-subtle" />
                            <span className="truncate max-w-[150px]">
                                {[prospect.arrondissementNom, prospect.marcheNom].filter(Boolean).join(' - ')}
                            </span>
                        </>
                    )}
                  </div>
                </div>
                <Eye size={14} className="text-content-muted group-hover:text-accent transition-colors flex-shrink-0" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-edge/50">
          {/* Left: Info + Per Page */}
          <div className="flex items-center gap-3 text-[11px] text-content-muted w-full sm:w-auto justify-between sm:justify-start">
            <span>
              {rangeStart}-{rangeEnd} sur {total}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="hidden sm:inline">Par page</span>
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                className="bg-surface border border-edge rounded px-1.5 py-0.5 text-[11px] text-content-primary focus:border-accent focus:outline-none"
              >
                {PAGE_SIZE_OPTIONS.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Right: Page Navigation */}
          {totalPages > 1 && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="p-1 rounded text-content-muted hover:text-content-primary hover:bg-surface disabled:opacity-30 disabled:pointer-events-none transition"
                title="Première page"
              >
                <ChevronsLeft size={14} />
              </button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1 rounded text-content-muted hover:text-content-primary hover:bg-surface disabled:opacity-30 disabled:pointer-events-none transition"
                title="Page précédente"
              >
                <ChevronLeft size={14} />
              </button>

              {/* Page numbers (desktop) */}
              <div className="hidden sm:flex items-center gap-0.5 mx-1">
                {getPageNumbers().map((p, i) =>
                  p === 'ellipsis' ? (
                    <span key={`e-${i}`} className="w-7 text-center text-[11px] text-content-muted">...</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-7 h-7 rounded text-[11px] font-bold transition ${
                        p === page
                          ? 'bg-accent-secondary text-content-primary shadow-sm'
                          : 'text-content-muted hover:bg-surface hover:text-content-primary'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              </div>

              {/* Mobile: simple page indicator */}
              <span className="sm:hidden text-[11px] text-content-muted mx-2 font-medium">
                {page}/{totalPages}
              </span>

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1 rounded text-content-muted hover:text-content-primary hover:bg-surface disabled:opacity-30 disabled:pointer-events-none transition"
                title="Page suivante"
              >
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="p-1 rounded text-content-muted hover:text-content-primary hover:bg-surface disabled:opacity-30 disabled:pointer-events-none transition"
                title="Dernière page"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          )}
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
