import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  canGoNext: boolean;
  canGoPrevious: boolean;
  itemsPerPage?: number;
  totalItems?: number;
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  canGoNext,
  canGoPrevious,
  itemsPerPage,
  totalItems,
  className = ''
}: PaginationProps) {
  // Générer les numéros de pages à afficher (mobile-first: moins de boutons)
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5; // Maximum de numéros visibles sur mobile

    if (totalPages <= maxVisible) {
      // Si peu de pages, afficher toutes
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Logique intelligente pour afficher pages pertinentes
      if (currentPage <= 3) {
        // Début: 1 2 3 4 ... last
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        // Fin: 1 ... n-3 n-2 n-1 n
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        // Milieu: 1 ... current-1 current current+1 ... last
        pages.push(1);
        pages.push('...');
        pages.push(currentPage - 1);
        pages.push(currentPage);
        pages.push(currentPage + 1);
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  const startItem = (currentPage - 1) * (itemsPerPage || 0) + 1;
  const endItem = Math.min(currentPage * (itemsPerPage || 0), totalItems || 0);

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 ${className}`}>
      {/* Info items (masquée sur très petit écran) */}
      {totalItems !== undefined && itemsPerPage !== undefined && (
        <div className="text-sm text-slate-400 hidden sm:block">
          Affichage <span className="text-white font-semibold">{startItem}-{endItem}</span> sur{' '}
          <span className="text-white font-semibold">{totalItems}</span>
        </div>
      )}

      {/* Contrôles pagination */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Première page (desktop only) */}
        <button
          onClick={() => onPageChange(1)}
          disabled={!canGoPrevious}
          className="hidden md:flex items-center justify-center w-8 h-8 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700 text-slate-300"
          title="Première page"
        >
          <ChevronsLeft size={18} />
        </button>

        {/* Page précédente */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!canGoPrevious}
          className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700 text-slate-300"
          title="Page précédente"
        >
          <ChevronLeft size={18} />
        </button>

        {/* Numéros de pages */}
        <div className="flex items-center gap-1">
          {pageNumbers.map((page, index) => {
            if (page === '...') {
              return (
                <span
                  key={`ellipsis-${index}`}
                  className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-slate-500"
                >
                  ...
                </span>
              );
            }

            const pageNum = page as number;
            const isActive = pageNum === currentPage;

            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        {/* Page suivante */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!canGoNext}
          className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700 text-slate-300"
          title="Page suivante"
        >
          <ChevronRight size={18} />
        </button>

        {/* Dernière page (desktop only) */}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={!canGoNext}
          className="hidden md:flex items-center justify-center w-8 h-8 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700 text-slate-300"
          title="Dernière page"
        >
          <ChevronsRight size={18} />
        </button>
      </div>

      {/* Info mobile (visible seulement sur petit écran) */}
      <div className="text-xs text-slate-400 sm:hidden">
        Page {currentPage}/{totalPages}
        {totalItems && ` · ${totalItems} éléments`}
      </div>
    </div>
  );
}
