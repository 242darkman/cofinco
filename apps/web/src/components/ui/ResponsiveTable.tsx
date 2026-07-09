import React, { ReactNode } from 'react';
import { LucideIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * ResponsiveTable Component - MicroFlex Platform
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
  mobileFormat?: (value: any, item: T) => ReactNode;
  mobileClassName?: string;
  badge?: boolean;          // Render as badge
  badgeClassName?: string;  // Custom class for badge
  icon?: LucideIcon;
  align?: 'left' | 'center' | 'right';
  headerAlign?: 'left' | 'center' | 'right';
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
  density?: 'normal' | 'compact' | 'spacious';
  className?: string;
  headerClassName?: string;
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
  density = 'normal',
  className,
  headerClassName,
}: ResponsiveTableProps<T>) {
  const primaryColumn = columns.find((col) => col.primary) || columns[0];

  // Density styles
  const densityStyles = {
    compact: {
      cellPadding: 'px-2 py-1.5',
      headingPadding: 'px-2 py-2',
      textSize: 'text-xs',
      iconSize: 12,
      rowGap: 'gap-1'
    },
    normal: {
      cellPadding: 'px-4 py-3',
      headingPadding: 'px-4 py-3',
      textSize: 'text-sm',
      iconSize: 14,
      rowGap: 'gap-1.5'
    },
    spacious: {
      cellPadding: 'px-6 py-4',
      headingPadding: 'px-6 py-4',
      textSize: 'text-base',
      iconSize: 16,
      rowGap: 'gap-2'
    }
  };

  const currentDensity = densityStyles[density];

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

  const formatMobileValue = (item: T, column: TableColumn<T>): ReactNode => {
    const value = getValue(item, column.key as string);
    if (column.mobileFormat) return column.mobileFormat(value, item);
    return formatValue(item, column);
  };

  // Badge component
  const Badge = ({ value, className }: { value: any, className?: string }) => {
    const colorMap: Record<string, string> = {
      Actif: 'bg-status-success-bg text-status-success border-status-success/20',
      Validé: 'bg-status-success-bg text-status-success border-status-success/20',
      'En cours': 'bg-status-info-bg text-status-info border-status-info/20',
      Suspendu: 'bg-status-warning-bg text-status-warning border-status-warning/20',
      Supprimé: 'bg-status-danger-bg text-status-danger border-status-danger/20',
      Rejeté: 'bg-status-danger-bg text-status-danger border-status-danger/20',
      Inactif: 'bg-surface-subtle/30 text-content-muted border-edge-strong/20',
      Standard: 'bg-surface-subtle/30 text-content-muted border-edge-strong/20',
      Premium: 'bg-accent/10 text-accent border-accent/20',
      VIP: 'bg-status-warning-bg text-status-warning border-status-warning/20',
      'Approuvée': 'bg-status-success-bg text-status-success border-status-success/20',
      'Approuvé': 'bg-status-success-bg text-status-success border-status-success/20',
      'Déboursé': 'bg-status-info-bg text-status-info border-status-info/20',
      'En attente': 'bg-status-warning-bg text-status-warning border-status-warning/20',
      'En cours d\'analyse': 'bg-accent/10 text-accent border-accent/20',
      'Annulée': 'bg-surface-subtle/30 text-content-muted border-edge-strong/20',
      'Rejetée': 'bg-status-danger-bg text-status-danger border-status-danger/20',
      'Approuvée après réévaluation': 'bg-status-info-bg text-status-info border-status-info/20',
      'Réévaluation en cours': 'bg-accent/10 text-accent border-accent/20',
      // Opérations Terrain
      'SUBMITTED': 'bg-status-warning-bg text-status-warning border-status-warning/20',
      'APPROVED': 'bg-status-info-bg text-status-info border-status-info/20',
      'SETTLED': 'bg-status-success-bg text-status-success border-status-success/20',
      'CANCELLED': 'bg-surface-subtle/30 text-content-muted border-edge-strong/20',
      'REJECTED': 'bg-status-danger-bg text-status-danger border-status-danger/20',
    };

    const colorClass = colorMap[value] || 'bg-surface-subtle/30 text-content-muted border-edge-strong/20';

    return (
      <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all duration-200 ${colorClass} ${className}`}>
        {value || '-'}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg className="animate-spin h-8 w-8 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12 text-content-muted">
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
                  {formatMobileValue(item, primaryColumn)}
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
                      const mobileContent = formatMobileValue(item, col);
                      if (
                        mobileContent === null ||
                        mobileContent === undefined ||
                        mobileContent === '' ||
                        (!col.mobileFormat && (value === null || value === undefined || (typeof value === 'string' && value === '')))
                      ) {
                        return null;
                      }
                      
                      return (
                        <div key={col.key as string} className={col.mobileClassName}>
                          {col.mobileFormat ? (
                            mobileContent
                          ) : col.badge ? (
                            <Badge value={value} className={col.badgeClassName} />
                          ) : (
                            mobileContent
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
        className={cn(`hidden ${mobileBreakpoint}:block overflow-auto bg-surface rounded-xl border border-edge`, className)}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table className={`w-full ${currentDensity.textSize}`}>
          <thead className={cn("bg-surface-base border-b border-edge", headerClassName)}>
            <tr>
              {columns.map((column) => {
                const align = column.headerAlign || column.align || 'left';
                return (
                  <th
                    key={column.key as string}
                    className={`${currentDensity.headingPadding} font-semibold text-content-secondary ${
                      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
                    }`}
                  >
                    <div className={`flex items-center gap-2 ${
                      align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
                    }`}>
                      {column.icon && <column.icon size={currentDensity.iconSize} />}
                      {column.label}
                    </div>
                  </th>
                );
              })}
              {actions && (
                <th className={`${currentDensity.headingPadding} text-left font-semibold text-content-secondary`}>
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr
                key={index}
                className={`border-b border-edge hover:bg-surface-elevated/50 transition-colors ${
                  index % 2 === 0 ? 'bg-surface/50' : ''
                } ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(item, index)}
              >
                {columns.map((column) => (
                  <td 
                    key={column.key as string} 
                    className={`${currentDensity.cellPadding} ${
                      column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'
                    }`}
                  >
                    {column.badge ? (
                      <Badge value={getValue(item, column.key as string)} className={column.badgeClassName} />
                    ) : (
                      <span className={column.primary ? 'font-semibold text-content-primary' : 'text-content-secondary'}>
                        {formatValue(item, column)}
                      </span>
                    )}
                  </td>
                ))}
                {actions && (
                  <td className={currentDensity.cellPadding}>
                    <div className={`flex ${currentDensity.rowGap}`}>{actions(item, index)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls - Mobile First */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-t border-edge bg-surface rounded-b-xl">
          <div className="text-xs sm:text-sm text-content-muted">
            <span className="hidden sm:inline">Page </span>{pagination.page}<span className="hidden sm:inline"> sur</span><span className="sm:hidden">/</span> {pagination.totalPages}
          </div>
          <div className="flex gap-2 sm:gap-3">
            <button
              onClick={() => pagination.onPageChange(Math.max(1, pagination.page - 1))}
              disabled={pagination.page === 1}
              className="min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:px-4 sm:py-2 flex items-center justify-center gap-1.5 text-sm font-medium border border-edge-strong rounded-lg hover:bg-surface-elevated disabled:opacity-40 disabled:cursor-not-allowed text-content-secondary transition-all active:scale-95"
              aria-label="Page précédente"
            >
              <ChevronLeft size={18} />
              <span className="hidden sm:inline">Précédent</span>
            </button>
            <button
              onClick={() => pagination.onPageChange(Math.min(pagination.totalPages, pagination.page + 1))}
              disabled={pagination.page === pagination.totalPages}
              className="min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:px-4 sm:py-2 flex items-center justify-center gap-1.5 text-sm font-medium border border-edge-strong rounded-lg hover:bg-surface-elevated disabled:opacity-40 disabled:cursor-not-allowed text-content-secondary transition-all active:scale-95"
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
