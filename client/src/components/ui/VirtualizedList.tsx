/**
 * Virtualized List Component
 *
 * High-performance list rendering for large datasets.
 * Only renders visible items, dramatically improving performance
 * on slow connections and devices.
 *
 * @module VirtualizedList
 */

import React, { useCallback, useMemo, type CSSProperties, type ReactNode, type ReactElement } from 'react';
import { List } from 'react-window';

// ========== TYPES ==========

export interface VirtualizedListProps<T> {
  /** Array of items to render */
  items: T[];
  /** Height of each item in pixels */
  itemHeight: number;
  /** Total height of the list container */
  height: number;
  /** Width of the list (default: 100%) */
  width?: number | string;
  /** Render function for each item */
  renderItem: (item: T, index: number, style: CSSProperties) => ReactNode;
  /** Optional key extractor */
  getItemKey?: (item: T, index: number) => string | number;
  /** Loading state */
  isLoading?: boolean;
  /** Loading skeleton component */
  loadingSkeleton?: ReactNode;
  /** Empty state component */
  emptyState?: ReactNode;
  /** Number of items to render outside visible area */
  overscanCount?: number;
  /** Additional class name for container */
  className?: string;
}

// Row props type for react-window v2
interface RowPropsData<T> {
  items: T[];
  renderItem: (item: T, index: number, style: CSSProperties) => ReactNode;
}

// ========== LOADING SKELETON ==========

const DefaultLoadingSkeleton = () => (
  <div className="space-y-3 p-4">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="animate-pulse flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-700" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-700 rounded w-3/4" />
          <div className="h-3 bg-slate-700/50 rounded w-1/2" />
        </div>
      </div>
    ))}
  </div>
);

// ========== EMPTY STATE ==========

const DefaultEmptyState = () => (
  <div className="flex flex-col items-center justify-center h-full py-12 text-center">
    <div className="w-16 h-16 mb-4 rounded-2xl bg-slate-800/50 flex items-center justify-center">
      <svg
        className="w-8 h-8 text-slate-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
        />
      </svg>
    </div>
    <p className="text-slate-400 text-sm">Aucun élément à afficher</p>
  </div>
);

// ========== ROW COMPONENT ==========

// Row component for react-window v2 - receives ariaAttributes, index, style, and custom rowProps
function VirtualizedRow<T>({
  index,
  style,
  items,
  renderItem,
}: {
  ariaAttributes: {
    "aria-posinset": number;
    "aria-setsize": number;
    role: "listitem";
  };
  index: number;
  style: CSSProperties;
} & RowPropsData<T>): ReactElement | null {
  const item = items[index];
  if (!item) return null;
  return <>{renderItem(item, index, style)}</>;
}

// ========== MAIN COMPONENT ==========

/**
 * Virtualized List using react-window v2
 *
 * @example
 * ```tsx
 * <VirtualizedList
 *   items={clients}
 *   itemHeight={72}
 *   height={600}
 *   renderItem={(client, index, style) => (
 *     <div style={style} key={client.id}>
 *       <ClientRow client={client} />
 *     </div>
 *   )}
 * />
 * ```
 */
export function VirtualizedList<T>({
  items,
  itemHeight,
  height,
  width = '100%',
  renderItem,
  getItemKey,
  isLoading = false,
  loadingSkeleton,
  emptyState,
  overscanCount = 5,
  className = '',
}: VirtualizedListProps<T>) {
  // Loading state
  if (isLoading) {
    return (
      <div className={className} style={{ height }}>
        {loadingSkeleton || <DefaultLoadingSkeleton />}
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div className={className} style={{ height }}>
        {emptyState || <DefaultEmptyState />}
      </div>
    );
  }

  // Props passed to each row in react-window v2
  const rowProps = useMemo(() => ({ items, renderItem }), [items, renderItem]);

  return (
    <List<RowPropsData<T>>
      style={{ height, width }}
      className={className}
      rowCount={items.length}
      rowHeight={itemHeight}
      overscanCount={overscanCount}
      rowComponent={VirtualizedRow}
      rowProps={rowProps}
    />
  );
}

// ========== SIMPLE WRAPPER FOR COMMON USE CASES ==========

interface SimpleVirtualizedListProps<T> {
  items: T[];
  height?: number;
  itemHeight?: number;
  renderItem: (item: T, index: number) => ReactNode;
  getItemKey?: (item: T, index: number) => string | number;
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
}

/**
 * Simplified virtualized list for common use cases
 */
export function SimpleVirtualizedList<T>({
  items,
  height = 400,
  itemHeight = 64,
  renderItem,
  getItemKey,
  isLoading = false,
  emptyMessage = 'Aucun élément',
  className = '',
}: SimpleVirtualizedListProps<T>) {
  return (
    <VirtualizedList
      items={items}
      height={height}
      itemHeight={itemHeight}
      isLoading={isLoading}
      getItemKey={getItemKey}
      className={className}
      emptyState={
        <div className="flex items-center justify-center h-full">
          <p className="text-slate-400 text-sm">{emptyMessage}</p>
        </div>
      }
      renderItem={(item, index, style) => (
        <div style={style} className="px-2">
          {renderItem(item, index)}
        </div>
      )}
    />
  );
}

export default VirtualizedList;
