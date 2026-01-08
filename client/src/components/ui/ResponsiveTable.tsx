import React, { ReactNode } from 'react';
import { LucideIcon, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * ResponsiveTable Component - COFIN Platform
 * Mobile-first table that displays as cards on mobile and table on desktop
 *
 * @example
 * <ResponsiveTable
 *   data={credits}
 *   columns={[
 *     { key: 'client', label: 'Client', primary: true },
 *     { key: 'montant', label: 'Montant', format: (val) => `${val} FC` },
 *     { key: 'statut', label: 'Statut', badge: true },
 *   ]}
 *   actions={(item) => (
 *     <>
 *       <IconButton icon={Eye} aria-label="Voir" />
 *       <IconButton icon={Edit2} aria-label="Modifier" />
 *     </>
 *   )}
 * />
 */

export interface TableColumn<T> {
  key: keyof T | string;
  label: string;
  primary?: boolean;        // Primary field (shown as title on mobile)
  hideOnMobile?: boolean;   // Hide this column on mobile card view
  format?: (value: any, item: T) => ReactNode;
  badge?: boolean;          // Render as badge
  icon?: LucideIcon;
  align?: 'left' | 'center' | 'right';
}

export interface ResponsiveTableProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  actions?: (item: T, index: number) => ReactNode;
  emptyMessage?: string;
  loading?: boolean;
  onRowClick?: (item: T, index: number) => void;
  mobileBreakpoint?: 'sm' | 'md' | 'lg';
  maxHeight?: string;
  pagination?: {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  };
}

function ResponsiveTable<T extends Record<string, any>>({
  data,
  columns,
  actions,
  emptyMessage = 'Aucune donnée disponible',
  loading = false,
  onRowClick,
  mobileBreakpoint = 'lg',
  maxHeight,
  pagination,
}: ResponsiveTableProps<T>) {
  const primaryColumn = columns.find((col) => col.primary) || columns[0];

  // Get value from nested key (e.g., 'user.name')
  const getValue = (item: T, key: string) => {
    return key.split('.').reduce((obj, k) => obj?.[k], item);
  };

  // Format value
  const formatValue = (item: T, column: TableColumn<T>): ReactNode => {
    const value = getValue(item, column.key as string);
    if (column.format) return column.format(value, item);
    
    // Convert non-renderable values to strings
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return String(value);
    return value;
  };

  // Badge component
  const Badge = ({ value }: { value: any }) => {
    const colorMap: Record<string, string> = {
      Actif: 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30',
      Validé: 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30',
      'En cours': 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30',
      Suspendu: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
      Supprimé: 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30',
      Rejeté: 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30',
      Inactif: 'bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30',
      Standard: 'bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30',
      Premium: 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30',
      VIP: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
      'Approuvée': 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      'Approuvé': 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      'Déboursé': 'bg-blue-600/20 text-blue-600 dark:text-blue-400 border-blue-500/30',
      'En attente': 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
      'En cours d\'analyse': 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
      'Annulée': 'bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30',
      'Rejetée': 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30',
    };

    const colorClass = colorMap[value] || 'bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30';

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colorClass}`}>
        {value || '-'}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg className="animate-spin h-8 w-8 text-cyan-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile View (Clean Cards) */}
      <div className={`block ${mobileBreakpoint}:hidden space-y-2 p-2`}>
        {data.map((item, index) => (
          <div
            key={index}
            className={`bg-surface-base border border-edge/60 rounded-xl overflow-hidden transition-all duration-150 ${
              onRowClick ? 'cursor-pointer active:bg-surface-muted/50' : ''
            }`}
            onClick={() => onRowClick?.(item, index)}
          >
            {/* Card Content */}
            <div className="p-3">
              {/* Header row with primary + actions */}
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  {formatValue(item, primaryColumn)}
                </div>
                {actions && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    {actions(item, index)}
                  </div>
                )}
              </div>

              {/* Tags row */}
              {columns.filter((col) => !col.primary && !col.hideOnMobile && String(col.key) !== 'actions').length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5 border-t border-edge/40">
                  {columns
                    .filter((col) => !col.primary && !col.hideOnMobile && String(col.key) !== 'actions')
                    .map((col) => {
                      const value = getValue(item, col.key as string);
                      if (value === null || value === undefined || (typeof value === 'string' && value === '')) return null;
                      
                      return (
                        <div key={col.key as string}>
                          {col.badge ? (
                            <Badge value={value} />
                          ) : (
                            formatValue(item, col)
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>


      {/* Desktop View (Table) */}
      <div 
        className={`hidden ${mobileBreakpoint}:block overflow-auto bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700`}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key as string}
                  className={`px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-300 text-xs ${
                    column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'
                  }`}
                >
                  <div className={`flex items-center gap-2 ${
                    column.align === 'right' ? 'justify-end' : column.align === 'center' ? 'justify-center' : 'justify-start'
                  }`}>
                    {column.icon && <column.icon size={14} />}
                    {column.label}
                  </div>
                </th>
              ))}
              {actions && (
                <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300 text-xs">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr
                key={index}
                className={`border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                  index % 2 === 0 ? 'bg-slate-50/50 dark:bg-slate-800/50' : ''
                } ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(item, index)}
              >
                {columns.map((column) => (
                  <td 
                    key={column.key as string} 
                    className={`px-4 py-3 ${
                      column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'
                    }`}
                  >
                    {column.badge ? (
                      <Badge value={getValue(item, column.key as string)} />
                    ) : (
                      <span className={column.primary ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}>
                        {formatValue(item, column)}
                      </span>
                    )}
                  </td>
                ))}
                {actions && (
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">{actions(item, index)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls - Mobile First */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-b-xl">
          <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            <span className="hidden sm:inline">Page </span>{pagination.page}<span className="hidden sm:inline"> sur</span><span className="sm:hidden">/</span> {pagination.totalPages}
          </div>
          <div className="flex gap-2 sm:gap-3">
            <button
              onClick={() => pagination.onPageChange(Math.max(1, pagination.page - 1))}
              disabled={pagination.page === 1}
              className="min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:px-4 sm:py-2 flex items-center justify-center gap-1.5 text-sm font-medium border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 dark:text-slate-300 transition-all active:scale-95"
              aria-label="Page précédente"
            >
              <ChevronLeft size={18} />
              <span className="hidden sm:inline">Précédent</span>
            </button>
            <button
              onClick={() => pagination.onPageChange(Math.min(pagination.totalPages, pagination.page + 1))}
              disabled={pagination.page === pagination.totalPages}
              className="min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:px-4 sm:py-2 flex items-center justify-center gap-1.5 text-sm font-medium border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 dark:text-slate-300 transition-all active:scale-95"
              aria-label="Page suivante"
            >
              <span className="hidden sm:inline">Suivant</span>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default ResponsiveTable;
