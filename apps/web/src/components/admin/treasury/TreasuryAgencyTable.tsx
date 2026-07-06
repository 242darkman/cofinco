import React, { useState, useMemo } from 'react';
import { Building2, Search, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { Card, Badge, Button } from '../../ui';
import { cn } from '@/lib/utils';
import { currencySymbol } from '@shared/config/currency';
import { formatCurrency, getAgencyColor } from './treasury-helpers';
import type { AgencyBreakdown } from './treasury-helpers';

interface Props {
  agencies: AgencyBreakdown[];
  selectedAgencies: string[];
  onToggleAgency: (id: string) => void;
}

const ITEMS_PER_PAGE = 12;

export default function TreasuryAgencyTable({ agencies, selectedAgencies, onToggleAgency }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!searchTerm) return agencies;
    const q = searchTerm.toLowerCase();
    return agencies.filter(a =>
      a.agenceNom.toLowerCase().includes(q) ||
      a.ville?.toLowerCase().includes(q)
    );
  }, [agencies, searchTerm]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-content-muted" />
          <h2 className="text-lg font-bold text-content-primary">
            Réseau Agences
            <span className="ml-2 bg-surface-subtle text-content-muted px-2 py-0.5 rounded text-xs">
              {filtered.length}
            </span>
          </h2>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" />
          <input
            type="text"
            placeholder="Filtrer..."
            className="block w-full pl-10 pr-3 py-2 border border-edge rounded-lg leading-5 bg-surface placeholder-content-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent sm:text-sm text-content-primary transition-colors"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {paginated.map((agency) => {
          const isSelected = selectedAgencies.includes(agency.agenceId);
          const isCritical = agency.solde <= 0;
          return (
            <Card
              key={agency.agenceId}
              className={cn(
                "rounded-xl p-6 shadow-card cursor-pointer transition-all duration-150 group relative",
                isCritical
                  ? "border-status-danger/30"
                  : isSelected
                    ? "ring-1 ring-accent border-accent bg-accent/[0.03]"
                    : "border-edge hover:border-accent"
              )}
              onClick={() => onToggleAgency(agency.agenceId)}
            >
              {isCritical && (
                <div className="absolute top-3 right-3 h-2 w-2 bg-status-danger rounded-full animate-pulse" />
              )}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-content-primary group-hover:text-accent transition-colors">
                    {agency.agenceNom}
                  </h3>
                  {agency.ville && (
                    <p className="text-sm text-content-secondary">{agency.ville}</p>
                  )}
                </div>
                <span className={cn(
                  "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                  agency.solde > 0
                    ? "bg-status-success-bg text-status-success"
                    : "bg-status-danger-bg text-status-danger"
                )}>
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full mr-1.5",
                    agency.solde > 0 ? "bg-status-success" : "bg-status-danger"
                  )} />
                  {agency.solde > 0 ? 'Actif' : 'Critique'}
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className={cn(
                  "text-2xl font-bold",
                  isCritical ? "text-status-danger" : "text-content-primary"
                )}>
                  {formatCurrency(agency.solde)}
                </span>
                <span className="text-sm font-medium text-content-muted">{currencySymbol()}</span>
              </div>

              {isCritical && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-status-danger font-medium">
                  <AlertTriangle size={14} />
                  Seuil bas atteint
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-8 w-8 p-0">
            <ChevronLeft size={16} />
          </Button>
          <span className="text-sm font-medium text-content-muted">{page}/{totalPages}</span>
          <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="h-8 w-8 p-0">
            <ChevronRight size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}
